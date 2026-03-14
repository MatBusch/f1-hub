import {
  type LiveEnvelope,
  type RaceControlMessage,
  type SessionDriver,
  type SessionIdentity,
  type TelemetryLapSummary,
  type TelemetrySample,
  type TrackOutlinePoint,
  type TrackPositionFrame,
} from "@f1-hub/contracts";

type TinybirdEventRow = Record<string, string | number | boolean | null>;

export type RawTopicEventInput = {
  id: string;
  sessionKey: number;
  sequence: number;
  topic: string;
  receivedAt: string;
  payloadJson: string;
};

export type SessionCatalogInput = SessionIdentity & {
  meetingName: string;
  startsAt: string;
  status: string;
  updatedAt: string;
};

export type SessionSummaryInput = SessionCatalogInput & {
  driverCount: number;
  lastSequence: number;
};

export type SessionBootInput = SessionIdentity & {
  meetingName: string;
  bootSequence: number;
  generatedAt: string;
  stateJson: string;
};

export type ReplayChunkInput = {
  sessionKey: number;
  chunkIndex: number;
  rangeStartSequence: number;
  rangeEndSequence: number;
  emittedAt: string;
  eventsJson: string;
};

export type TrackPositionFrameInput = TrackPositionFrame;
export type TelemetryLapSummaryInput = TelemetryLapSummary;
export type TelemetrySampleInput = TelemetrySample;

export class TinybirdEventsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly dryRun = false,
  ) {}

  appendRawTopicEvents(rows: RawTopicEventInput[]) {
    return this.append("raw_topic_events", rows);
  }

  appendSessions(rows: SessionCatalogInput[]) {
    return this.append(
      "f1_sessions",
      rows.map((row) => ({
        season: row.season,
        meetingKey: row.meetingKey,
        meetingName: row.meetingName,
        sessionKey: row.sessionKey,
        sessionName: row.sessionName ?? row.sessionType,
        sessionType: row.sessionType,
        startsAt: row.startsAt,
        status: row.status,
        updatedAt: row.updatedAt,
      })),
    );
  }

  appendSessionSummaries(rows: SessionSummaryInput[]) {
    return this.append("session_summaries", rows);
  }

  appendLiveEnvelopes(rows: LiveEnvelope[]) {
    return this.append(
      "live_envelopes",
      rows.map((row) => ({
        id: row.id,
        sessionKey: row.sessionKey,
        sequence: row.sequence,
        emittedAt: row.emittedAt,
        receivedAt: row.receivedAt ?? null,
        mode: row.mode,
        topic: row.topic,
        payloadJson: JSON.stringify(row.payload),
      })),
    );
  }

  appendRaceControlMessages(rows: RaceControlMessage[]) {
    return this.append(
      "race_control_messages",
      rows.map((row) => ({
        sessionKey: row.sessionKey,
        sequence: row.sequence,
        emittedAt: row.emittedAt,
        category: row.category,
        title: row.title,
        body: row.body,
        flag: row.flag ?? null,
        scope: row.scope ?? null,
      })),
    );
  }

  appendSessionBootSnapshots(rows: SessionBootInput[]) {
    return this.append(
      "session_boot_snapshots",
      rows.map((row) => ({
        season: row.season,
        meetingKey: row.meetingKey,
        meetingName: row.meetingName,
        sessionKey: row.sessionKey,
        sessionName: row.sessionName ?? row.sessionType,
        sessionType: row.sessionType,
        bootSequence: row.bootSequence,
        generatedAt: row.generatedAt,
        stateJson: row.stateJson,
      })),
    );
  }

  appendSessionDrivers(rows: SessionDriver[]) {
    return this.append(
      "session_drivers",
      rows.map((row) => ({
        sessionKey: row.sessionKey,
        meetingKey: row.meetingKey,
        driverNumber: row.driverNumber,
        broadcastName: row.broadcastName,
        fullName: row.fullName,
        nameAcronym: row.nameAcronym,
        teamName: row.teamName,
        teamColor: row.teamColor,
        headshotUrl: row.headshotUrl ?? null,
      })),
    );
  }

  appendTrackPositionFrames(rows: TrackPositionFrameInput[]) {
    return this.append(
      "track_position_frames",
      rows.map((row) => ({
        sessionKey: row.sessionKey,
        meetingKey: row.meetingKey,
        driverNumber: row.driverNumber,
        emittedAt: row.emittedAt,
        position: row.position ?? null,
        x: row.x ?? null,
        y: row.y ?? null,
        z: row.z ?? null,
        source: row.source,
      })),
    );
  }

  appendTrackOutlinePoints(rows: TrackOutlinePoint[]) {
    return this.append(
      "track_outline_points",
      rows.map((row) => ({
        sessionKey: row.sessionKey,
        meetingKey: row.meetingKey,
        pointIndex: row.pointIndex,
        x: row.x,
        y: row.y,
        z: row.z ?? null,
        source: row.source,
      })),
    );
  }

  appendReplayChunks(rows: ReplayChunkInput[]) {
    return this.append("replay_chunk_records", rows);
  }

  appendTelemetryLapSummaries(rows: TelemetryLapSummaryInput[]) {
    return this.append(
      "telemetry_lap_summaries",
      rows.map((row) => ({
        sessionKey: row.sessionKey,
        meetingKey: row.meetingKey,
        driverNumber: row.driverNumber,
        lapNumber: row.lapNumber,
        lapStartTime: row.lapStartTime,
        lapEndTime: row.lapEndTime ?? null,
        lapDurationMs: row.lapDurationMs ?? null,
        sector1Ms: row.sector1Ms ?? null,
        sector2Ms: row.sector2Ms ?? null,
        sector3Ms: row.sector3Ms ?? null,
        isPitOutLap: row.isPitOutLap,
        stintNumber: row.stintNumber ?? null,
        compound: row.compound ?? null,
        topSpeed: row.topSpeed ?? null,
      })),
    );
  }

  appendTelemetrySamples(rows: TelemetrySampleInput[]) {
    return this.append(
      "telemetry_samples",
      rows.map((row) => ({
        sessionKey: row.sessionKey,
        meetingKey: row.meetingKey,
        driverNumber: row.driverNumber,
        lapNumber: row.lapNumber,
        emittedAt: row.emittedAt,
        speed: row.speed ?? null,
        rpm: row.rpm ?? null,
        gear: row.gear ?? null,
        throttle: row.throttle ?? null,
        brake: row.brake ?? null,
        drs: row.drs ?? null,
        battery: row.battery ?? null,
      })),
    );
  }

  private async append(datasource: string, rows: TinybirdEventRow[]) {
    if (rows.length === 0) {
      return { datasource, rowCount: 0, dryRun: this.dryRun };
    }

    const body = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;

    if (this.dryRun) {
      return {
        datasource,
        rowCount: rows.length,
        dryRun: true,
        preview: rows[0],
      };
    }

    const url = new URL("/v0/events", this.baseUrl);
    url.searchParams.set("name", datasource);

    const response = await this.fetchImpl(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "text/plain; charset=utf-8",
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Tinybird append failed for ${datasource}: ${response.status} ${errorText}`,
      );
    }

    return {
      datasource,
      rowCount: rows.length,
      dryRun: false,
    };
  }
}
