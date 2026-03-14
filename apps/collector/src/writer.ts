import { createHash, randomUUID } from "node:crypto";

import { createTinybirdRepository } from "@f1-hub/data";
import { type TrackPositionFrame } from "@f1-hub/contracts";

import { getCollectorConfig } from "./config.js";
import { createWriterMetrics } from "./metrics.js";
import { deriveSessionStatus } from "./openf1.js";
import { connectRedis, ensureStreamGroup, getDlqKey } from "./redis.js";
import {
  createBootstrapEnvelopes,
  extractRaceControlMessagesFromPayload,
  extractTrackPositionFramesFromPayload,
} from "./signalr.js";
import {
  type SessionBootPayload,
  streamEnvelopeSchema,
  type StreamEnvelope,
  type TopicUpdatePayload,
} from "./stream-types.js";
import { buildTrackOutline } from "./track.js";
import { TinybirdEventsClient } from "./tinybird-events.js";

type ParsedStreamEntry = {
  redisId: string;
  message: StreamEnvelope;
};

type SessionWriterState = {
  driverCount: number;
  outlineAppended: boolean;
  outlineSourceDriverNumber?: number;
  outlineSourceFrames: TrackPositionFrame[];
  lastSequence: number;
};

function fieldsToObject(fields: string[]) {
  const record: Record<string, string> = {};

  for (let index = 0; index < fields.length; index += 2) {
    const key = fields[index];
    const value = fields[index + 1];

    if (key !== undefined && value !== undefined) {
      record[key] = value;
    }
  }

  return record;
}

function parseStreamEntries(raw: unknown): ParsedStreamEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const parsed: ParsedStreamEntry[] = [];

  for (const stream of raw) {
    if (!Array.isArray(stream) || stream.length < 2) {
      continue;
    }

    const entries = stream[1];

    if (!Array.isArray(entries)) {
      continue;
    }

    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length < 2) {
        continue;
      }

      const redisId = entry[0];
      const fieldPairs = entry[1];

      if (typeof redisId !== "string" || !Array.isArray(fieldPairs)) {
        continue;
      }

      const rawObject = fieldsToObject(fieldPairs.filter((value): value is string => typeof value === "string"));
      const parsedMessage = streamEnvelopeSchema.parse({
        streamVersion: rawObject.streamVersion,
        messageType: rawObject.messageType,
        messageId: rawObject.messageId,
        collectorRunId: rawObject.collectorRunId,
        producerInstanceId: rawObject.producerInstanceId,
        season: Number.parseInt(rawObject.season ?? "0", 10),
        meetingKey: Number.parseInt(rawObject.meetingKey ?? "0", 10),
        meetingName: rawObject.meetingName,
        sessionKey: Number.parseInt(rawObject.sessionKey ?? "0", 10),
        sessionType: rawObject.sessionType,
        sessionName: rawObject.sessionName,
        startsAt: rawObject.startsAt,
        endsAt: rawObject.endsAt,
        sequence:
          rawObject.sequence && rawObject.sequence.length > 0
            ? Number.parseInt(rawObject.sequence, 10)
            : null,
        upstreamTopic:
          rawObject.upstreamTopic && rawObject.upstreamTopic.length > 0
            ? rawObject.upstreamTopic
            : null,
        normalizedTopic:
          rawObject.normalizedTopic && rawObject.normalizedTopic.length > 0
            ? rawObject.normalizedTopic
            : null,
        emittedAt: rawObject.emittedAt,
        receivedAt: rawObject.receivedAt,
        publishedAt: rawObject.publishedAt,
        payloadJson: rawObject.payloadJson,
      });

      parsed.push({ redisId, message: parsedMessage });
    }
  }

  return parsed;
}

function topicDedupeKey(message: StreamEnvelope, suffix: string) {
  return `collector:dedupe:${message.sessionKey}:${message.messageType}:${message.sequence ?? 0}:${suffix}`;
}

async function shouldSkipByDedupe(
  key: string,
  exists: (key: string) => Promise<number>,
) {
  return (await exists(key)) > 0;
}

async function markDedupe(
  key: string,
  ttlSeconds: number,
  set: (key: string, value: string, options: { EX: number }) => Promise<unknown>,
) {
  await set(key, "1", { EX: ttlSeconds });
}

async function incrementFailureCount(
  messageId: string,
  ttlSeconds: number,
  incr: (key: string) => Promise<number>,
  expire: (key: string, seconds: number) => Promise<number>,
) {
  const key = `collector:failures:${messageId}`;
  const count = await incr(key);
  if (count === 1) {
    await expire(key, ttlSeconds);
  }
  return count;
}

function hashPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function appendSessionSummary(
  tinybird: TinybirdEventsClient,
  state: SessionWriterState,
  message: StreamEnvelope,
) {
  await tinybird.appendSessionSummaries([
    {
      season: message.season,
      meetingKey: message.meetingKey,
      meetingName: message.meetingName,
      sessionKey: message.sessionKey,
      sessionType: message.sessionType,
      sessionName: message.sessionName,
      status: deriveSessionStatus(message.startsAt, message.endsAt),
      startsAt: message.startsAt,
      updatedAt: new Date().toISOString(),
      driverCount: state.driverCount,
      lastSequence: state.lastSequence,
    },
  ]);
}

export async function startWriter() {
  const config = getCollectorConfig();
  const metrics = await createWriterMetrics(config);
  const redis = await connectRedis(config.redisUrl);
  await ensureStreamGroup(redis, config);

  const consumerName = `writer-${process.pid}`;
  const tinybird = new TinybirdEventsClient(
    config.tinybirdUrl,
    config.tinybirdToken,
    fetch,
    config.dryRun,
  );
  const repository = createTinybirdRepository({
    baseUrl: config.tinybirdUrl,
    token: config.tinybirdToken,
    fetch,
  });
  const states = new Map<number, SessionWriterState>();
  const dlqKey = getDlqKey(config.streamKey);

  console.log(`[collector:writer] boot ${new Date().toISOString()}`);
  console.log(`[collector:writer] redis stream: ${config.streamKey}`);
  console.log(`[collector:writer] redis group: ${config.streamGroup}`);
  console.log(`[collector:writer] dry run mode: ${config.dryRun ? "on" : "off"}`);

  const processEntry = async ({ redisId, message }: ParsedStreamEntry) => {
    let state = states.get(message.sessionKey);

    if (!state) {
      const [existingDrivers, existingOutline] = await Promise.all([
        repository.getSessionDrivers(message.sessionKey),
        repository.getTrackOutline(message.sessionKey),
      ]);

      state = {
        driverCount: existingDrivers.data.length,
        outlineAppended: existingOutline.data.length > 0,
        outlineSourceDriverNumber: undefined,
        outlineSourceFrames: [],
        lastSequence: 0,
      };
      states.set(message.sessionKey, state);
      metrics.activeSessions.set(states.size);
    }

    const lagSeconds = Math.max(
      0,
      (Date.now() - new Date(message.emittedAt).getTime()) / 1000,
    );
    metrics.endToEndLagSeconds.labels(message.messageType).observe(lagSeconds);

    if (message.messageType === "session_boot") {
      const payload = JSON.parse(message.payloadJson) as SessionBootPayload;
      state.driverCount = payload.driverCount;
      state.outlineSourceDriverNumber = payload.drivers[0]?.driverNumber;

      const sessionKeyBase = `collector:session:${message.sessionKey}`;

      if (
        !(await shouldSkipByDedupe(
          `${sessionKeyBase}:catalog`,
          (key) => redis.exists(key),
        ))
      ) {
        await tinybird.appendSessions([
          {
            season: message.season,
            meetingKey: message.meetingKey,
            meetingName: message.meetingName,
            sessionKey: message.sessionKey,
            sessionType: message.sessionType,
            sessionName: message.sessionName,
            startsAt: message.startsAt,
            status: payload.status,
            updatedAt: message.receivedAt,
          },
        ]);
        metrics.tinybirdRowsTotal.labels("f1_sessions").inc(1);
        await markDedupe(
          `${sessionKeyBase}:catalog`,
          config.dedupeTtlSeconds,
          (key, value, options) => redis.set(key, value, options),
        );
      }

      if (
        !(await shouldSkipByDedupe(
          `${sessionKeyBase}:boot:${message.collectorRunId}`,
          (key) => redis.exists(key),
        ))
      ) {
        await tinybird.appendSessionBootSnapshots([
          {
            season: message.season,
            meetingKey: message.meetingKey,
            meetingName: message.meetingName,
            sessionKey: message.sessionKey,
            sessionType: message.sessionType,
            sessionName: message.sessionName,
            bootSequence: payload.bootSequence,
            generatedAt: message.receivedAt,
            stateJson: JSON.stringify(payload.initialState),
          },
        ]);
        metrics.tinybirdRowsTotal.labels("session_boot_snapshots").inc(1);
        await markDedupe(
          `${sessionKeyBase}:boot:${message.collectorRunId}`,
          config.dedupeTtlSeconds,
          (key, value, options) => redis.set(key, value, options),
        );
      }

      if (
        payload.drivers.length > 0 &&
        !(await shouldSkipByDedupe(
          `${sessionKeyBase}:drivers`,
          (key) => redis.exists(key),
        ))
      ) {
        await tinybird.appendSessionDrivers(payload.drivers);
        metrics.tinybirdRowsTotal
          .labels("session_drivers")
          .inc(payload.drivers.length);
        await markDedupe(
          `${sessionKeyBase}:drivers`,
          config.dedupeTtlSeconds,
          (key, value, options) => redis.set(key, value, options),
        );
      }

      const bootstrapLive = createBootstrapEnvelopes(
        message.sessionKey,
        (() => {
          let bootstrapSequence = 0;
          return () => {
            bootstrapSequence += 1;
            return bootstrapSequence;
          };
        })(),
        payload.initialState,
        message.receivedAt,
      );
      const bootstrapRaceControl = extractRaceControlMessagesFromPayload(
        message.sessionKey,
        (() => {
          let raceSequence = 10_000_000;
          return () => {
            raceSequence += 1;
            return raceSequence;
          };
        })(),
        payload.initialState.RaceControlMessages,
        message.receivedAt,
      );
      const bootstrapTrackFrames = extractTrackPositionFramesFromPayload(
        message.sessionKey,
        message.meetingKey,
        payload.initialState["Position.z"],
        message.receivedAt,
      );

      if (
        bootstrapLive.length > 0 &&
        !(await shouldSkipByDedupe(
          `${sessionKeyBase}:bootstrap:live`,
          (key) => redis.exists(key),
        ))
      ) {
        await tinybird.appendLiveEnvelopes(bootstrapLive);
        metrics.tinybirdRowsTotal
          .labels("live_envelopes")
          .inc(bootstrapLive.length);
        await markDedupe(
          `${sessionKeyBase}:bootstrap:live`,
          config.dedupeTtlSeconds,
          (key, value, options) => redis.set(key, value, options),
        );
      }

      if (
        bootstrapRaceControl.length > 0 &&
        !(await shouldSkipByDedupe(
          `${sessionKeyBase}:bootstrap:race`,
          (key) => redis.exists(key),
        ))
      ) {
        await tinybird.appendRaceControlMessages(bootstrapRaceControl);
        metrics.tinybirdRowsTotal
          .labels("race_control_messages")
          .inc(bootstrapRaceControl.length);
        await markDedupe(
          `${sessionKeyBase}:bootstrap:race`,
          config.dedupeTtlSeconds,
          (key, value, options) => redis.set(key, value, options),
        );
      }

      if (
        bootstrapTrackFrames.length > 0 &&
        !(await shouldSkipByDedupe(
          `${sessionKeyBase}:bootstrap:track`,
          (key) => redis.exists(key),
        ))
      ) {
        await tinybird.appendTrackPositionFrames(bootstrapTrackFrames);
        metrics.tinybirdRowsTotal
          .labels("track_position_frames")
          .inc(bootstrapTrackFrames.length);
        await markDedupe(
          `${sessionKeyBase}:bootstrap:track`,
          config.dedupeTtlSeconds,
          (key, value, options) => redis.set(key, value, options),
        );
      }

      if (!state.outlineAppended && state.outlineSourceDriverNumber !== undefined) {
        state.outlineSourceFrames.push(
          ...bootstrapTrackFrames.filter(
            (frame) => frame.driverNumber === state!.outlineSourceDriverNumber,
          ),
        );
      }

      state.lastSequence = Math.max(state.lastSequence, message.sequence ?? 0);
      await appendSessionSummary(tinybird, state, message);
      metrics.tinybirdRowsTotal.labels("session_summaries").inc(1);
      await redis.sendCommand([
        "XACK",
        config.streamKey,
        config.streamGroup,
        redisId,
      ]);
      return;
    }

    const payload = JSON.parse(message.payloadJson) as TopicUpdatePayload;
    const rawKey = topicDedupeKey(message, "raw");
    const liveKey = topicDedupeKey(message, "live");
    const raceKey = topicDedupeKey(message, "race");
    const trackKey = topicDedupeKey(message, "track");

    if (!(await shouldSkipByDedupe(rawKey, (key) => redis.exists(key)))) {
      await tinybird.appendRawTopicEvents([
        {
          id: randomUUID(),
          sessionKey: message.sessionKey,
          sequence: message.sequence ?? 0,
          topic: payload.topic,
          receivedAt: message.receivedAt,
          payloadJson: JSON.stringify(payload.data),
        },
      ]);
      metrics.tinybirdRowsTotal.labels("raw_topic_events").inc(1);
      await markDedupe(rawKey, config.dedupeTtlSeconds, (key, value, options) =>
        redis.set(key, value, options),
      );
    }

    if (
      message.normalizedTopic &&
      !(await shouldSkipByDedupe(liveKey, (key) => redis.exists(key)))
    ) {
      await tinybird.appendLiveEnvelopes([
        {
          id: randomUUID(),
          sessionKey: message.sessionKey,
          sequence: message.sequence ?? 0,
          emittedAt: message.emittedAt,
          receivedAt: message.receivedAt,
          mode: "patch",
          topic: message.normalizedTopic as never,
          payload: payload.data,
        },
      ]);
      metrics.tinybirdRowsTotal.labels("live_envelopes").inc(1);
      await markDedupe(liveKey, config.dedupeTtlSeconds, (key, value, options) =>
        redis.set(key, value, options),
      );
    }

    if (
      payload.topic === "RaceControlMessages" &&
      !(await shouldSkipByDedupe(raceKey, (key) => redis.exists(key)))
    ) {
      const raceControl = extractRaceControlMessagesFromPayload(
        message.sessionKey,
        (() => {
          let raceSequence = (message.sequence ?? 0) * 1000;
          return () => {
            raceSequence += 1;
            return raceSequence;
          };
        })(),
        payload.data,
        message.emittedAt,
      );
      if (raceControl.length > 0) {
        await tinybird.appendRaceControlMessages(raceControl);
        metrics.tinybirdRowsTotal
          .labels("race_control_messages")
          .inc(raceControl.length);
      }
      await markDedupe(raceKey, config.dedupeTtlSeconds, (key, value, options) =>
        redis.set(key, value, options),
      );
    }

    if (
      payload.topic === "Position.z" &&
      !(await shouldSkipByDedupe(trackKey, (key) => redis.exists(key)))
    ) {
      const frames = extractTrackPositionFramesFromPayload(
        message.sessionKey,
        message.meetingKey,
        payload.data,
        message.emittedAt,
      );
      if (frames.length > 0) {
        await tinybird.appendTrackPositionFrames(frames);
        metrics.tinybirdRowsTotal
          .labels("track_position_frames")
          .inc(frames.length);
        if (!state.outlineAppended && state.outlineSourceDriverNumber !== undefined) {
          state.outlineSourceFrames.push(
            ...frames.filter(
              (frame) => frame.driverNumber === state!.outlineSourceDriverNumber,
            ),
          );
          if (
            state.outlineSourceFrames.length >
            config.maxOutlineSourceFrames
          ) {
            state.outlineSourceFrames.splice(
              0,
              state.outlineSourceFrames.length - config.maxOutlineSourceFrames,
            );
          }
        }
      }
      await markDedupe(trackKey, config.dedupeTtlSeconds, (key, value, options) =>
        redis.set(key, value, options),
      );
    }

    if (
      !state.outlineAppended &&
      state.outlineSourceDriverNumber !== undefined &&
      state.outlineSourceFrames.length >= 1200
    ) {
      const outlineKey = `collector:outline:${message.sessionKey}:v1`;
      if (!(await shouldSkipByDedupe(outlineKey, (key) => redis.exists(key)))) {
        const outlinePoints = buildTrackOutline(state.outlineSourceFrames);
        if (outlinePoints.length >= 160) {
          await tinybird.appendTrackOutlinePoints(outlinePoints);
          metrics.tinybirdRowsTotal
            .labels("track_outline_points")
            .inc(outlinePoints.length);
          await markDedupe(
            outlineKey,
            config.dedupeTtlSeconds,
            (key, value, options) => redis.set(key, value, options),
          );
          state.outlineAppended = true;
          state.outlineSourceFrames = [];
        }
      }
    }

    state.lastSequence = Math.max(state.lastSequence, message.sequence ?? 0);
    await appendSessionSummary(tinybird, state, message);
    metrics.tinybirdRowsTotal.labels("session_summaries").inc(1);
    await redis.sendCommand([
      "XACK",
      config.streamKey,
      config.streamGroup,
      redisId,
    ]);
  };

  for (;;) {
    try {
      const claimedRaw = await redis.sendCommand([
        "XAUTOCLAIM",
        config.streamKey,
        config.streamGroup,
        consumerName,
        String(config.pendingIdleMs),
        "0-0",
        "COUNT",
        String(config.streamBatchSize),
      ]);
      const claimedEntries = Array.isArray(claimedRaw) && Array.isArray(claimedRaw[1])
        ? parseStreamEntries([[config.streamKey, claimedRaw[1]]])
        : [];
      if (claimedEntries.length > 0) {
        metrics.reclaimedMessagesTotal.inc(claimedEntries.length);
      }

      const readRaw = await redis.sendCommand([
        "XREADGROUP",
        "GROUP",
        config.streamGroup,
        consumerName,
        "COUNT",
        String(config.streamBatchSize),
        "BLOCK",
        String(config.streamBlockMs),
        "STREAMS",
        config.streamKey,
        ">",
      ]);
      const readEntries = parseStreamEntries(readRaw);
      const entries = [...claimedEntries, ...readEntries];

      if (entries.length === 0) {
        continue;
      }

      metrics.streamBatchesTotal.inc();
      metrics.streamBatchSize.observe(entries.length);
      metrics.activeSessions.set(states.size);

      console.log(
        `[collector:writer] batch size=${entries.length} pending sessions=${states.size}`,
      );

      for (const entry of entries) {
        try {
          await processEntry(entry);
          metrics.streamMessagesProcessedTotal
            .labels(entry.message.messageType)
            .inc();
        } catch (error) {
          metrics.streamFailuresTotal.labels(entry.message.messageType).inc();
          const failureCount = await incrementFailureCount(
            entry.message.messageId,
            config.dedupeTtlSeconds,
            (key) => redis.incr(key),
            (key, seconds) => redis.expire(key, seconds),
          );
          const errorText = error instanceof Error ? error.message : String(error);

          console.error(
            `[collector:writer] failed message ${entry.message.messageId} attempt=${failureCount}`,
            error,
          );

          if (failureCount >= config.dlqMaxDeliveries) {
            metrics.streamDlqTotal.inc();
            await redis.sendCommand([
              "XADD",
              dlqKey,
              "*",
              "originalRedisId",
              entry.redisId,
              "messageId",
              entry.message.messageId,
              "deliveryCount",
              String(failureCount),
              "failedAt",
              new Date().toISOString(),
              "error",
              errorText,
              "payloadHash",
              hashPayload(entry.message),
              "payloadJson",
              JSON.stringify(entry.message),
            ]);
            await redis.sendCommand([
              "XACK",
              config.streamKey,
              config.streamGroup,
              entry.redisId,
            ]);
          }
        }
      }
    } catch (error) {
      console.error("[collector:writer] runtime error", error);
    }
  }
}

await startWriter();
