import {
  liveEnvelopeSchema,
  type LiveEnvelope,
  type NormalizedTopic,
  type RaceControlMessage,
  type ReplayChunk,
  type SessionDriver,
  type SessionBoot,
  type SessionSummary,
  telemetryLapSummarySchema,
  telemetrySampleSchema,
  type TelemetryLapSummary,
  type TelemetrySample,
  trackOutlinePointSchema,
  type TrackOutlinePoint,
  trackPositionFrameSchema,
  type TrackPositionFrame,
} from "@f1-hub/contracts";
import { z } from "zod";

const jsonStringSchema = <T>(schema: z.ZodType<T>) =>
  z.string().transform((value, ctx) => {
    try {
      return schema.parse(JSON.parse(value));
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          error instanceof Error
            ? error.message
            : "Invalid JSON payload from Tinybird",
      });
      return z.NEVER;
    }
  });

const tinybirdDateTimeSchema = z.string().transform((value, ctx) => {
  const normalized =
    value.includes("T") || /[+-]\d\d:\d\d$/.test(value)
      ? value
      : `${value.replace(" ", "T")}Z`;

  if (Number.isNaN(Date.parse(normalized))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid Tinybird datetime: ${value}`,
    });
    return z.NEVER;
  }

  return new Date(normalized).toISOString();
});

const tinybirdJsonSchema = <TRow>(rowSchema: z.ZodType<TRow>) =>
  z.object({
    data: z.array(rowSchema),
    rows: z.number().int().nonnegative().optional(),
  });

const tinybirdSingleRowSchema = <TRow>(rowSchema: z.ZodType<TRow>) =>
  z.object({
    data: z.array(rowSchema).length(1),
  });

const tinybirdOptionalRowSchema = <TRow>(rowSchema: z.ZodType<TRow>) =>
  z.object({
    data: z.array(rowSchema).max(1),
  });

export const tinybirdConfigSchema = z.object({
  baseUrl: z.string().url(),
  token: z.string().min(1),
  fetch: z.custom<typeof fetch>(
    (value) => value === undefined || typeof value === "function",
  ),
});

export type TinybirdRepositoryConfig = {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
};

export type SessionCatalogParams = {
  season?: number;
  status?: string;
  limit?: number;
};

export type ReplayChunkParams = {
  sessionKey: number;
  fromChunk: number;
  toChunk?: number;
};

export type RaceControlParams = {
  sessionKey: number;
  limit?: number;
};

export type LiveWindowParams = {
  sessionKey: number;
  fromSequence?: number;
  limit?: number;
  topic?: NormalizedTopic;
};

export type LiveTopicTimeWindowParams = {
  sessionKey: number;
  topic?: NormalizedTopic;
  fromTime?: string;
  toTime?: string;
  limit?: number;
};

export type TelemetryLapSummaryParams = {
  sessionKey: number;
  driverNumber: number;
};

export type TelemetryTraceParams = {
  sessionKey: number;
  driverNumber: number;
  lapNumber: number;
};

export type TrackPositionFrameParams = {
  sessionKey: number;
  driverNumber?: number;
  fromTime?: string;
  toTime?: string;
  limit?: number;
};

export type TrackReplayFrameParams = {
  sessionKey: number;
  atTime: string;
  windowMs?: number;
};

const sessionCatalogRowSchema = z.object({
  season: z.number().int().min(2018),
  meetingKey: z.number().int().nonnegative(),
  meetingName: z.string().min(1),
  sessionKey: z.number().int().nonnegative(),
  sessionName: z.string().min(1),
  sessionType: z.string().min(1),
  startsAt: tinybirdDateTimeSchema,
  status: z.string().min(1),
  driverCount: z.number().int().nonnegative(),
  frameCount: z.number().int().nonnegative(),
  outlinePointCount: z.number().int().nonnegative(),
  lastFrameAt: tinybirdDateTimeSchema.nullable(),
  hasDrivers: z.boolean(),
  hasFrames: z.boolean(),
  hasOutline: z.boolean(),
  replayReady: z.boolean(),
});

const sessionSummaryRowSchema = z
  .object({
    season: z.number().int(),
    meetingKey: z.number().int(),
    meetingName: z.string(),
    sessionKey: z.number().int(),
    sessionName: z.string(),
    sessionType: z.string(),
    status: z.string(),
    driverCount: z.number().int().nonnegative(),
    lastSequence: z.number().int().nonnegative(),
    updatedAt: tinybirdDateTimeSchema,
  })
  .transform(
    (row): SessionSummary => ({
      session: {
        season: row.season,
        meetingKey: row.meetingKey,
        sessionKey: row.sessionKey,
        sessionType: row.sessionType,
        sessionName: row.sessionName,
      },
      status: row.status,
      driverCount: row.driverCount,
      lastSequence: row.lastSequence,
      updatedAt: row.updatedAt,
    }),
  );

const sessionBootRowSchema = z
  .object({
    season: z.number().int(),
    meetingKey: z.number().int(),
    meetingName: z.string(),
    sessionKey: z.number().int(),
    sessionName: z.string(),
    sessionType: z.string(),
    bootSequence: z.number().int().nonnegative(),
    generatedAt: tinybirdDateTimeSchema,
    stateJson: jsonStringSchema(z.record(z.string(), z.unknown())),
  })
  .transform(
    (row): SessionBoot => ({
      session: {
        season: row.season,
        meetingKey: row.meetingKey,
        sessionKey: row.sessionKey,
        sessionType: row.sessionType,
        sessionName: row.sessionName,
      },
      bootSequence: row.bootSequence,
      generatedAt: row.generatedAt,
      state: row.stateJson,
    }),
  );

const replayChunkRowSchema = z
  .object({
    sessionKey: z.number().int(),
    chunkIndex: z.number().int().nonnegative(),
    rangeStartSequence: z.number().int().nonnegative(),
    rangeEndSequence: z.number().int().nonnegative(),
    emittedAt: tinybirdDateTimeSchema,
    eventsJson: jsonStringSchema(z.array(liveEnvelopeSchema)),
  })
  .transform(
    (row): ReplayChunk => ({
      sessionKey: row.sessionKey,
      chunkIndex: row.chunkIndex,
      rangeStartSequence: row.rangeStartSequence,
      rangeEndSequence: row.rangeEndSequence,
      emittedAt: row.emittedAt,
      events: row.eventsJson,
    }),
  );

const raceControlFeedRowSchema = z
  .object({
    sessionKey: z.number().int(),
    sequence: z.number().int().nonnegative(),
    emittedAt: tinybirdDateTimeSchema,
    category: z.string(),
    title: z.string(),
    body: z.string(),
    flag: z.string().nullable(),
    scope: z.string().nullable(),
  })
  .transform(
    (row): RaceControlMessage => ({
      sessionKey: row.sessionKey,
      sequence: row.sequence,
      emittedAt: row.emittedAt,
      category: row.category,
      title: row.title,
      body: row.body,
      flag: row.flag ?? undefined,
      scope: row.scope ?? undefined,
    }),
  );

const liveWindowRowSchema = z
  .object({
    id: z.string(),
    sessionKey: z.number().int(),
    sequence: z.number().int().nonnegative(),
    emittedAt: tinybirdDateTimeSchema,
    receivedAt: tinybirdDateTimeSchema.nullable(),
    mode: z.enum(["snapshot", "patch"]),
    topic: liveEnvelopeSchema.shape.topic,
    payloadJson: jsonStringSchema(z.unknown()),
  })
  .transform(
    (row): LiveEnvelope => ({
      id: row.id,
      sessionKey: row.sessionKey,
      sequence: row.sequence,
      emittedAt: row.emittedAt,
      receivedAt: row.receivedAt ?? undefined,
      mode: row.mode,
      topic: row.topic,
      payload: row.payloadJson,
    }),
  );

const sessionDriverRowSchema = z
  .object({
    sessionKey: z.number().int(),
    meetingKey: z.number().int(),
    driverNumber: z.number().int().nonnegative(),
    broadcastName: z.string(),
    fullName: z.string(),
    nameAcronym: z.string(),
    teamName: z.string(),
    teamColor: z.string(),
    headshotUrl: z.string().nullable(),
  })
  .transform(
    (row): SessionDriver => ({
      sessionKey: row.sessionKey,
      meetingKey: row.meetingKey,
      driverNumber: row.driverNumber,
      broadcastName: row.broadcastName,
      fullName: row.fullName,
      nameAcronym: row.nameAcronym,
      teamName: row.teamName,
      teamColor: row.teamColor,
      headshotUrl: row.headshotUrl ?? undefined,
    }),
  );

const trackPositionFrameRowSchema = z
  .object({
    sessionKey: z.number().int(),
    meetingKey: z.number().int(),
    driverNumber: z.number().int().nonnegative(),
    emittedAt: tinybirdDateTimeSchema,
    position: z.number().int().nonnegative().nullable(),
    x: z.number().int().nullable(),
    y: z.number().int().nullable(),
    z: z.number().int().nullable(),
    source: z.string(),
  })
  .transform(
    (row): TrackPositionFrame =>
      trackPositionFrameSchema.parse({
        sessionKey: row.sessionKey,
        meetingKey: row.meetingKey,
        driverNumber: row.driverNumber,
        emittedAt: row.emittedAt,
        position: row.position,
        x: row.x,
        y: row.y,
        z: row.z,
        source: row.source,
      }),
  );

const trackOutlinePointRowSchema = z
  .object({
    sessionKey: z.number().int(),
    meetingKey: z.number().int(),
    pointIndex: z.number().int().nonnegative(),
    x: z.number().int(),
    y: z.number().int(),
    z: z.number().int().nullable(),
    source: z.string(),
  })
  .transform(
    (row): TrackOutlinePoint =>
      trackOutlinePointSchema.parse({
        sessionKey: row.sessionKey,
        meetingKey: row.meetingKey,
        pointIndex: row.pointIndex,
        x: row.x,
        y: row.y,
        z: row.z,
        source: row.source,
      }),
  );

const telemetryLapSummaryRowSchema = z
  .object({
    sessionKey: z.number().int(),
    meetingKey: z.number().int(),
    driverNumber: z.number().int().nonnegative(),
    lapNumber: z.number().int().positive(),
    lapStartTime: tinybirdDateTimeSchema,
    lapEndTime: tinybirdDateTimeSchema.nullable(),
    lapDurationMs: z.number().int().nullable(),
    sector1Ms: z.number().int().nullable(),
    sector2Ms: z.number().int().nullable(),
    sector3Ms: z.number().int().nullable(),
    isPitOutLap: z.boolean(),
    stintNumber: z.number().int().nullable(),
    compound: z.string().nullable(),
    topSpeed: z.number().int().nullable(),
  })
  .transform(
    (row): TelemetryLapSummary =>
      telemetryLapSummarySchema.parse({
        sessionKey: row.sessionKey,
        meetingKey: row.meetingKey,
        driverNumber: row.driverNumber,
        lapNumber: row.lapNumber,
        lapStartTime: row.lapStartTime,
        lapEndTime: row.lapEndTime,
        lapDurationMs: row.lapDurationMs,
        sector1Ms: row.sector1Ms,
        sector2Ms: row.sector2Ms,
        sector3Ms: row.sector3Ms,
        isPitOutLap: row.isPitOutLap,
        stintNumber: row.stintNumber,
        compound: row.compound ?? undefined,
        topSpeed: row.topSpeed,
      }),
  );

const telemetrySampleRowSchema = z
  .object({
    sessionKey: z.number().int(),
    meetingKey: z.number().int(),
    driverNumber: z.number().int().nonnegative(),
    lapNumber: z.number().int().positive(),
    emittedAt: tinybirdDateTimeSchema,
    speed: z.number().int().nullable(),
    rpm: z.number().int().nullable(),
    gear: z.number().int().nullable(),
    throttle: z.number().int().nullable(),
    brake: z.number().int().nullable(),
    drs: z.number().int().nullable(),
    battery: z.number().int().nullable(),
  })
  .transform(
    (row): TelemetrySample =>
      telemetrySampleSchema.parse({
        sessionKey: row.sessionKey,
        meetingKey: row.meetingKey,
        driverNumber: row.driverNumber,
        lapNumber: row.lapNumber,
        emittedAt: row.emittedAt,
        speed: row.speed,
        rpm: row.rpm,
        gear: row.gear,
        throttle: row.throttle,
        brake: row.brake,
        drs: row.drs,
        battery: row.battery,
      }),
  );

export class TinybirdRepository {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(input: TinybirdRepositoryConfig) {
    const config = tinybirdConfigSchema.parse(input);

    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.token = config.token;
    this.fetchImpl = config.fetch ?? fetch;
  }

  getSessionCatalog(params: SessionCatalogParams = {}) {
    return this.query(
      "session_catalog",
      {
        season_filter: params.season,
        status_filter: params.status,
        limit: params.limit,
      },
      tinybirdJsonSchema(sessionCatalogRowSchema),
    );
  }

  async getSessionSummary(sessionKey: number): Promise<SessionSummary> {
    const response = await this.query(
      "session_summary",
      { session_key: sessionKey },
      tinybirdSingleRowSchema(sessionSummaryRowSchema),
    );

    return response.data[0];
  }

  async getSessionBoot(sessionKey: number): Promise<SessionBoot | undefined> {
    const response = await this.query(
      "session_boot",
      { session_key: sessionKey },
      tinybirdOptionalRowSchema(sessionBootRowSchema),
    );

    return response.data[0];
  }

  getReplayChunks(
    params: ReplayChunkParams,
  ): Promise<{ data: ReplayChunk[]; rows?: number }> {
    return this.query(
      "replay_chunks",
      {
        session_key: params.sessionKey,
        from_chunk: params.fromChunk,
        to_chunk: params.toChunk,
      },
      tinybirdJsonSchema(replayChunkRowSchema),
    );
  }

  getRaceControlFeed(
    params: RaceControlParams,
  ): Promise<{ data: RaceControlMessage[]; rows?: number }> {
    return this.query(
      "race_control_feed",
      {
        session_key: params.sessionKey,
        limit: params.limit,
      },
      tinybirdJsonSchema(raceControlFeedRowSchema),
    );
  }

  getLiveWindow(
    params: LiveWindowParams,
  ): Promise<{ data: LiveEnvelope[]; rows?: number }> {
    return this.query(
      "live_window",
      {
        session_key: params.sessionKey,
        from_sequence: params.fromSequence,
        limit: params.limit,
        topic_filter: params.topic,
      },
      tinybirdJsonSchema(liveWindowRowSchema),
    );
  }

  getLiveTopicTimeWindow(
    params: LiveTopicTimeWindowParams,
  ): Promise<{ data: LiveEnvelope[]; rows?: number }> {
    return this.query(
      "live_topic_time_window",
      {
        session_key: params.sessionKey,
        topic_filter: params.topic,
        from_time: params.fromTime,
        to_time: params.toTime,
        limit: params.limit,
      },
      tinybirdJsonSchema(liveWindowRowSchema),
    );
  }

  getTelemetryLapSummaries(
    params: TelemetryLapSummaryParams,
  ): Promise<{ data: TelemetryLapSummary[]; rows?: number }> {
    return this.query(
      "telemetry_lap_summary_list",
      {
        session_key: params.sessionKey,
        driver_number: params.driverNumber,
      },
      tinybirdJsonSchema(telemetryLapSummaryRowSchema),
    );
  }

  getTelemetryTrace(
    params: TelemetryTraceParams,
  ): Promise<{ data: TelemetrySample[]; rows?: number }> {
    return this.query(
      "telemetry_trace_samples",
      {
        session_key: params.sessionKey,
        driver_number: params.driverNumber,
        lap_number: params.lapNumber,
      },
      tinybirdJsonSchema(telemetrySampleRowSchema),
    );
  }

  getSessionDrivers(
    sessionKey: number,
  ): Promise<{ data: SessionDriver[]; rows?: number }> {
    return this.query(
      "session_driver_directory",
      { session_key: sessionKey },
      tinybirdJsonSchema(sessionDriverRowSchema),
    );
  }

  getTrackPositionFrames(
    params: TrackPositionFrameParams,
  ): Promise<{ data: TrackPositionFrame[]; rows?: number }> {
    return this.query(
      "track_position_frame_window",
      {
        session_key: params.sessionKey,
        driver_number: params.driverNumber,
        from_time: params.fromTime,
        to_time: params.toTime,
        limit: params.limit,
      },
      tinybirdJsonSchema(trackPositionFrameRowSchema),
    );
  }

  getTrackLatestPositions(
    sessionKey: number,
  ): Promise<{ data: TrackPositionFrame[]; rows?: number }> {
    return this.query(
      "track_latest_positions",
      { session_key: sessionKey },
      tinybirdJsonSchema(trackPositionFrameRowSchema),
    );
  }

  getTrackReplayFrame(
    params: TrackReplayFrameParams,
  ): Promise<{ data: TrackPositionFrame[]; rows?: number }> {
    return this.query(
      "track_replay_frame",
      {
        session_key: params.sessionKey,
        at_time: params.atTime,
        window_ms: params.windowMs,
      },
      tinybirdJsonSchema(trackPositionFrameRowSchema),
    );
  }

  getTrackOutline(
    sessionKey: number,
  ): Promise<{ data: TrackOutlinePoint[]; rows?: number }> {
    return this.query(
      "track_outline",
      { session_key: sessionKey },
      tinybirdJsonSchema(trackOutlinePointRowSchema),
    );
  }

  private async query<T>(
    endpoint: string,
    params: Record<string, number | string | undefined>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const url = new URL(`/v0/pipes/${endpoint}.json`, this.baseUrl);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await this.fetchImpl(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Tinybird query failed for ${endpoint}: ${response.status} ${body}`,
      );
    }

    const payload = await response.json();
    return schema.parse(payload);
  }
}

export function createTinybirdRepository(config: TinybirdRepositoryConfig) {
  return new TinybirdRepository(config);
}
