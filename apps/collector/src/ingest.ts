import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { type SessionDriver, signalrTopics } from "@f1-hub/contracts";

import { getCollectorConfig } from "./config.js";
import { createIngestMetrics } from "./metrics.js";
import {
  deriveMeetingName,
  deriveSessionStatus,
  OpenF1Client,
} from "./openf1.js";
import { connectRedis } from "./redis.js";
import {
  F1SignalRClient,
  normalizeTimestamp,
  normalizeTopic,
} from "./signalr.js";
import { publishStreamMessage } from "./stream-producer.js";
import { type SessionBootPayload, type TopicUpdatePayload } from "./stream-types.js";

function mapSessionDrivers(
  sessionKey: number,
  meetingKey: number,
  meetingName: string,
  drivers: Awaited<ReturnType<OpenF1Client["getSessionDrivers"]>>,
): SessionDriver[] {
  return drivers.map((driver) => ({
    sessionKey,
    meetingKey,
    driverNumber: driver.driver_number,
    broadcastName:
      driver.broadcast_name ??
      driver.name_acronym ??
      `#${driver.driver_number}`,
    fullName:
      driver.full_name ??
      driver.broadcast_name ??
      `Driver ${driver.driver_number}`,
    nameAcronym:
      driver.name_acronym ??
      driver.broadcast_name?.slice(0, 3) ??
      String(driver.driver_number),
    teamName: driver.team_name ?? meetingName,
    teamColor: driver.team_colour ?? "9A9A9A",
    headshotUrl: driver.headshot_url ?? undefined,
  }));
}

export async function startIngest() {
  const startedAt = new Date().toISOString();
  const collectorRunId = randomUUID();
  const producerInstanceId = `${process.pid}`;
  const config = getCollectorConfig();
  const metrics = await createIngestMetrics(config);
  const redis = await connectRedis(config.redisUrl);
  const openF1 = new OpenF1Client();

  console.log(`[collector:ingest] boot ${startedAt}`);
  console.log(
    "[collector:ingest] write path: SignalR/OpenF1 -> Redis Streams -> Tinybird writer",
  );
  console.log(`[collector:ingest] upstream topic count: ${signalrTopics.length}`);
  console.log(`[collector:ingest] topic plan: ${signalrTopics.join(", ")}`);
  console.log(`[collector:ingest] redis stream: ${config.streamKey}`);

  for (;;) {
    const activeSession = await openF1.getCurrentSession(new Date());

    if (!activeSession) {
      console.log(
        "[collector:ingest] no current OpenF1 session found; retrying in 60s",
      );
      await sleep(60_000);
      continue;
    }

    const driverCount = await openF1.getMeetingDriverCount(
      activeSession.meeting_key,
    );
    const currentTimestamp = new Date().toISOString();
    const currentStatus = deriveSessionStatus(
      activeSession.date_start,
      activeSession.date_end,
    );
    const meetingName = deriveMeetingName(activeSession);

    let sequence = 0;
    const nextSequence = () => {
      sequence += 1;
      return sequence;
    };

    const signalr = new F1SignalRClient();

    try {
      metrics.currentSessionKey.set(activeSession.session_key);
      const openF1Drivers = await openF1.getSessionDrivers(
        activeSession.session_key,
      );
      const driverRows = mapSessionDrivers(
        activeSession.session_key,
        activeSession.meeting_key,
        meetingName,
        openF1Drivers,
      );

      await signalr.connect();
      metrics.signalrConnected.set(1);
      metrics.signalrConnectionsTotal.inc();
      const initialState = (await signalr.subscribe()) as Record<
        string,
        unknown
      >;

      const bootPayload: SessionBootPayload = {
        status: currentStatus,
        driverCount,
        bootSequence: 0,
        initialState,
        drivers: driverRows,
      };

      const publishBootEnd = metrics.redisPublishDurationSeconds
        .labels("session_boot")
        .startTimer();
      await publishStreamMessage(redis, config, {
        streamVersion: "1",
        messageType: "session_boot",
        messageId: randomUUID(),
        collectorRunId,
        producerInstanceId,
        season: activeSession.year,
        meetingKey: activeSession.meeting_key,
        meetingName,
        sessionKey: activeSession.session_key,
        sessionType: activeSession.session_type,
        sessionName: activeSession.session_name,
        startsAt: new Date(activeSession.date_start).toISOString(),
        endsAt: new Date(activeSession.date_end).toISOString(),
        sequence: 0,
        upstreamTopic: null,
        normalizedTopic: null,
        emittedAt: currentTimestamp,
        receivedAt: currentTimestamp,
        publishedAt: new Date().toISOString(),
        payloadJson: JSON.stringify(bootPayload),
      });
      publishBootEnd();
      metrics.redisPublishesTotal.labels("session_boot", "").inc();

      console.log(
        `[collector:ingest] connected for session ${activeSession.session_key} (${activeSession.session_name})`,
      );

      for (;;) {
        const updates = await signalr.nextUpdates();

        for (const update of updates) {
          if (
            update.topic === "SessionInfo" &&
            typeof update.data === "object" &&
            update.data !== null &&
            "Name" in update.data
          ) {
            console.log(
              "[collector:ingest] session rollover detected; reconnecting",
            );
            signalr.close();
            throw new Error("Session rollover");
          }

          const receivedAt = new Date().toISOString();
          const emittedAt = normalizeTimestamp(update.timestamp);
          const payload: TopicUpdatePayload = {
            topic: update.topic,
            timestamp: update.timestamp,
            data: update.data,
          };

          const publishUpdateEnd = metrics.redisPublishDurationSeconds
            .labels("topic_update")
            .startTimer();
          await publishStreamMessage(redis, config, {
            streamVersion: "1",
            messageType: "topic_update",
            messageId: randomUUID(),
            collectorRunId,
            producerInstanceId,
            season: activeSession.year,
            meetingKey: activeSession.meeting_key,
            meetingName,
            sessionKey: activeSession.session_key,
            sessionType: activeSession.session_type,
            sessionName: activeSession.session_name,
            startsAt: new Date(activeSession.date_start).toISOString(),
            endsAt: new Date(activeSession.date_end).toISOString(),
            sequence: nextSequence(),
            upstreamTopic: update.topic,
            normalizedTopic: normalizeTopic(update.topic),
            emittedAt,
            receivedAt,
            publishedAt: new Date().toISOString(),
            payloadJson: JSON.stringify(payload),
          });
          publishUpdateEnd();
          metrics.redisPublishesTotal
            .labels("topic_update", update.topic)
            .inc();
        }
      }
    } catch (error) {
      metrics.signalrConnected.set(0);
      metrics.signalrReconnectsTotal.inc();
      metrics.redisPublishFailuresTotal.labels("unknown").inc();
      console.error("[collector:ingest] runtime error", error);
      signalr.close();
      await sleep(5_000);
    }
  }
}

await startIngest();
