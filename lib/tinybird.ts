import {
  Tinybird,
  defineDatasource,
  defineEndpoint,
  engine,
  node,
  p,
  t,
  type InferOutputRow,
  type InferParams,
  type InferRow,
} from "@tinybirdco/sdk";

export const rawTopicEvents = defineDatasource("raw_topic_events", {
  description: "Raw upstream SignalR topic payloads captured by the collector.",
  schema: {
    id: t.string(),
    sessionKey: t.int32(),
    sequence: t.int64(),
    topic: t.string().lowCardinality(),
    receivedAt: t.dateTime(),
    payloadJson: t.string(),
  },
  engine: engine.mergeTree({
    sortingKey: ["sessionKey", "sequence"],
    partitionKey: "toYYYYMM(receivedAt)",
  }),
});

export const helloTinybird = defineDatasource("hello_tinybird", {
  description:
    "Legacy placeholder datasource preserved to avoid destructive main deploys.",
  schema: {
    timestamp: t.dateTime(),
    message: t.string(),
  },
  forwardQuery: `
    SELECT
      timestamp,
      defaultValueOfTypeName('String') AS message
  `,
  engine: engine.mergeTree({
    sortingKey: ["timestamp"],
    partitionKey: "toYYYYMM(timestamp)",
  }),
});

export const f1Sessions = defineDatasource("f1_sessions", {
  description:
    "Session catalog rows used to render schedule and session entry points.",
  schema: {
    season: t.int32(),
    meetingKey: t.int32(),
    meetingName: t.string(),
    sessionKey: t.int32(),
    sessionName: t.string(),
    sessionType: t.string().lowCardinality(),
    startsAt: t.dateTime(),
    status: t.string().lowCardinality(),
    updatedAt: t.dateTime(),
  },
  engine: engine.mergeTree({
    sortingKey: ["season", "meetingKey", "sessionKey"],
    partitionKey: "season",
  }),
});

export const sessionSummaries = defineDatasource("session_summaries", {
  description: "Latest session summary rows for fast dashboard boot.",
  schema: {
    season: t.int32(),
    meetingKey: t.int32(),
    meetingName: t.string(),
    sessionKey: t.int32(),
    sessionName: t.string(),
    sessionType: t.string().lowCardinality(),
    status: t.string().lowCardinality(),
    driverCount: t.int32(),
    lastSequence: t.int64(),
    updatedAt: t.dateTime(),
  },
  engine: engine.mergeTree({
    sortingKey: ["sessionKey", "updatedAt"],
    partitionKey: "toYYYYMM(updatedAt)",
  }),
});

export const liveEnvelopes = defineDatasource("live_envelopes", {
  description: "Normalized live and replay envelopes written by the collector.",
  schema: {
    id: t.string(),
    sessionKey: t.int32(),
    sequence: t.int64(),
    emittedAt: t.dateTime(),
    receivedAt: t.dateTime().nullable(),
    mode: t.string().lowCardinality(),
    topic: t.string().lowCardinality(),
    payloadJson: t.string(),
  },
  engine: engine.mergeTree({
    sortingKey: ["sessionKey", "sequence"],
    partitionKey: "toYYYYMM(emittedAt)",
  }),
});

export const raceControlMessages = defineDatasource("race_control_messages", {
  description: "Race control feed messages normalized for direct UI rendering.",
  schema: {
    sessionKey: t.int32(),
    sequence: t.int64(),
    emittedAt: t.dateTime(),
    category: t.string().lowCardinality(),
    title: t.string(),
    body: t.string(),
    flag: t.string().lowCardinality().nullable(),
    scope: t.string().lowCardinality().nullable(),
  },
  engine: engine.mergeTree({
    sortingKey: ["sessionKey", "sequence"],
    partitionKey: "toYYYYMM(emittedAt)",
  }),
});

export const sessionBootSnapshots = defineDatasource("session_boot_snapshots", {
  description:
    "Boot snapshots used to make historical session startup constant-time.",
  schema: {
    season: t.int32(),
    meetingKey: t.int32(),
    meetingName: t.string(),
    sessionKey: t.int32(),
    sessionName: t.string(),
    sessionType: t.string().lowCardinality(),
    bootSequence: t.int64(),
    generatedAt: t.dateTime(),
    stateJson: t.string(),
  },
  engine: engine.mergeTree({
    sortingKey: ["sessionKey", "generatedAt"],
    partitionKey: "toYYYYMM(generatedAt)",
  }),
});

export const sessionDrivers = defineDatasource("session_drivers", {
  description:
    "Per-session driver directory for replay, maps, and driver media surfaces.",
  schema: {
    sessionKey: t.int32(),
    meetingKey: t.int32(),
    driverNumber: t.int32(),
    broadcastName: t.string(),
    fullName: t.string(),
    nameAcronym: t.string(),
    teamName: t.string(),
    teamColor: t.string(),
    headshotUrl: t.string().nullable(),
  },
  engine: engine.mergeTree({
    sortingKey: ["sessionKey", "driverNumber"],
    partitionKey: "sessionKey",
  }),
});

export const trackPositionFrames = defineDatasource("track_position_frames", {
  description:
    "Historical and live-ready driver track frames for replay and map rendering.",
  schema: {
    sessionKey: t.int32(),
    meetingKey: t.int32(),
    driverNumber: t.int32(),
    emittedAt: t.dateTime64(3, "UTC"),
    position: t.int32().nullable(),
    x: t.int32().nullable(),
    y: t.int32().nullable(),
    z: t.int32().nullable(),
    source: t.string().lowCardinality(),
  },
  engine: engine.mergeTree({
    sortingKey: ["sessionKey", "driverNumber", "emittedAt"],
    partitionKey: "toYYYYMM(toDateTime(emittedAt))",
  }),
});

export const trackOutlinePoints = defineDatasource("track_outline_points", {
  description:
    "Simplified per-session track outline points materialized for fast map rendering.",
  schema: {
    sessionKey: t.int32(),
    meetingKey: t.int32(),
    pointIndex: t.int32(),
    x: t.int32(),
    y: t.int32(),
    z: t.int32().nullable(),
    source: t.string().lowCardinality(),
  },
  engine: engine.mergeTree({
    sortingKey: ["sessionKey", "pointIndex"],
    partitionKey: "sessionKey",
  }),
});

export const replayChunkRecords = defineDatasource("replay_chunk_records", {
  description:
    "Replay chunks generated by the collector for near-instant scrub and resume.",
  schema: {
    sessionKey: t.int32(),
    chunkIndex: t.int32(),
    rangeStartSequence: t.int64(),
    rangeEndSequence: t.int64(),
    emittedAt: t.dateTime(),
    eventsJson: t.string(),
  },
  engine: engine.mergeTree({
    sortingKey: ["sessionKey", "chunkIndex"],
    partitionKey: "toYYYYMM(emittedAt)",
  }),
});

export const telemetryLapSummariesDatasource = defineDatasource(
  "telemetry_lap_summaries",
  {
    description:
      "Per-driver lap summaries normalized for telemetry analysis pages.",
    schema: {
      sessionKey: t.int32(),
      meetingKey: t.int32(),
      driverNumber: t.int32(),
      lapNumber: t.int32(),
      lapStartTime: t.dateTime64(3, "UTC"),
      lapEndTime: t.dateTime64(3, "UTC").nullable(),
      lapDurationMs: t.int32().nullable(),
      sector1Ms: t.int32().nullable(),
      sector2Ms: t.int32().nullable(),
      sector3Ms: t.int32().nullable(),
      isPitOutLap: t.bool(),
      stintNumber: t.int32().nullable(),
      compound: t.string().nullable(),
      topSpeed: t.int32().nullable(),
    },
    engine: engine.mergeTree({
      sortingKey: ["sessionKey", "driverNumber", "lapNumber"],
      partitionKey: "sessionKey",
    }),
  },
);

export const telemetrySamplesDatasource = defineDatasource(
  "telemetry_samples",
  {
    description:
      "Per-sample telemetry traces normalized for driver lap comparison charts.",
    schema: {
      sessionKey: t.int32(),
      meetingKey: t.int32(),
      driverNumber: t.int32(),
      lapNumber: t.int32(),
      emittedAt: t.dateTime64(3, "UTC"),
      speed: t.int32().nullable(),
      rpm: t.int32().nullable(),
      gear: t.int32().nullable(),
      throttle: t.int32().nullable(),
      brake: t.int32().nullable(),
      drs: t.int32().nullable(),
      battery: t.int32().nullable(),
    },
    engine: engine.mergeTree({
      sortingKey: ["sessionKey", "driverNumber", "lapNumber", "emittedAt"],
      partitionKey: "toYYYYMM(toDateTime(emittedAt))",
    }),
  },
);

export type RawTopicEventRow = InferRow<typeof rawTopicEvents>;
export type HelloTinybirdRow = InferRow<typeof helloTinybird>;
export type F1SessionRow = InferRow<typeof f1Sessions>;
export type SessionSummaryRow = InferRow<typeof sessionSummaries>;
export type LiveEnvelopeRow = InferRow<typeof liveEnvelopes>;
export type RaceControlMessageRow = InferRow<typeof raceControlMessages>;
export type SessionBootSnapshotRow = InferRow<typeof sessionBootSnapshots>;
export type SessionDriverRow = InferRow<typeof sessionDrivers>;
export type TrackPositionFrameRow = InferRow<typeof trackPositionFrames>;
export type TrackOutlinePointRow = InferRow<typeof trackOutlinePoints>;
export type ReplayChunkRow = InferRow<typeof replayChunkRecords>;
export type TelemetryLapSummaryRow = InferRow<
  typeof telemetryLapSummariesDatasource
>;
export type TelemetrySampleRow = InferRow<typeof telemetrySamplesDatasource>;

export const sessionCatalog = defineEndpoint("session_catalog", {
  description: "List recent sessions for the session catalog and entry pages.",
  params: {
    season_filter: p
      .int32()
      .optional(0)
      .describe("Optional season filter, 0 means all seasons."),
    status_filter: p
      .string()
      .optional("")
      .describe("Optional status filter, empty means all statuses."),
    limit: p
      .int32()
      .optional(50)
      .describe("Maximum number of sessions to return."),
  },
  nodes: [
    node({
      name: "catalog_rows",
      sql: `
        WITH latest_sessions AS (
          SELECT
            sessionKey,
            argMax(season, updatedAt) AS season,
            argMax(meetingKey, updatedAt) AS meetingKey,
            argMax(meetingName, updatedAt) AS meetingName,
            argMax(sessionName, updatedAt) AS sessionName,
            argMax(sessionType, updatedAt) AS sessionType,
            argMax(startsAt, updatedAt) AS startsAt,
            argMax(status, updatedAt) AS status
          FROM f1_sessions
          GROUP BY sessionKey
        ),
        driver_counts AS (
          SELECT
            sessionKey,
            toInt32(count()) AS driverCount
          FROM session_drivers
          GROUP BY sessionKey
        ),
        frame_counts AS (
          SELECT
            sessionKey,
            toInt32(count()) AS frameCount,
            max(emittedAt) AS lastFrameAt
          FROM track_position_frames
          GROUP BY sessionKey
        ),
        outline_counts AS (
          SELECT
            sessionKey,
            toInt32(count()) AS outlinePointCount
          FROM (
            SELECT
              sessionKey,
              pointIndex
            FROM track_outline_points
            GROUP BY
              sessionKey,
              pointIndex
          )
          GROUP BY sessionKey
        )
        SELECT
          s.sessionKey AS sessionKey,
          s.season AS season,
          s.meetingKey AS meetingKey,
          s.meetingName AS meetingName,
          s.sessionName AS sessionName,
          s.sessionType AS sessionType,
          s.startsAt AS startsAt,
          s.status AS status,
          coalesce(d.driverCount, toInt32(0)) AS driverCount,
          coalesce(f.frameCount, toInt32(0)) AS frameCount,
          coalesce(o.outlinePointCount, toInt32(0)) AS outlinePointCount,
          nullIf(
            f.lastFrameAt,
            toDateTime64('1970-01-01 00:00:00', 3, 'UTC')
          ) AS lastFrameAt,
          toBool(coalesce(d.driverCount, toInt32(0)) > 0) AS hasDrivers,
          toBool(coalesce(f.frameCount, toInt32(0)) > 0) AS hasFrames,
          toBool(coalesce(o.outlinePointCount, toInt32(0)) > 0) AS hasOutline,
          toBool(
            coalesce(d.driverCount, toInt32(0)) > 0
            AND coalesce(f.frameCount, toInt32(0)) > 0
            AND coalesce(o.outlinePointCount, toInt32(0)) > 0
          ) AS replayReady
        FROM latest_sessions AS s
        LEFT JOIN driver_counts AS d ON d.sessionKey = s.sessionKey
        LEFT JOIN frame_counts AS f ON f.sessionKey = s.sessionKey
        LEFT JOIN outline_counts AS o ON o.sessionKey = s.sessionKey
        WHERE ({{Int32(season_filter, 0)}} = 0 OR s.season = {{Int32(season_filter, 0)}})
          AND (
            {{String(status_filter, '')}} = ''
            OR s.status = {{String(status_filter, '')}}
          )
        ORDER BY s.startsAt DESC
        LIMIT {{Int32(limit, 50)}}
      `,
    }),
  ],
  output: {
    season: t.int32(),
    meetingKey: t.int32(),
    meetingName: t.string(),
    sessionKey: t.int32(),
    sessionName: t.string(),
    sessionType: t.string(),
    startsAt: t.dateTime(),
    status: t.string(),
    driverCount: t.int32(),
    frameCount: t.int32(),
    outlinePointCount: t.int32(),
    lastFrameAt: t.dateTime64(3, "UTC").nullable(),
    hasDrivers: t.bool(),
    hasFrames: t.bool(),
    hasOutline: t.bool(),
    replayReady: t.bool(),
  },
});

export const sessionSummary = defineEndpoint("session_summary", {
  description: "Load the latest summary row for a single session.",
  params: {
    session_key: p.int32().describe("Session key to fetch."),
  },
  nodes: [
    node({
      name: "latest_summary",
      sql: `
        SELECT
          season,
          meetingKey,
          meetingName,
          sessionKey,
          sessionName,
          sessionType,
          status,
          driverCount,
          lastSequence,
          updatedAt
        FROM session_summaries
        WHERE sessionKey = {{Int32(session_key)}}
        ORDER BY updatedAt DESC
        LIMIT 1
      `,
    }),
  ],
  output: {
    season: t.int32(),
    meetingKey: t.int32(),
    meetingName: t.string(),
    sessionKey: t.int32(),
    sessionName: t.string(),
    sessionType: t.string(),
    status: t.string(),
    driverCount: t.int32(),
    lastSequence: t.int64(),
    updatedAt: t.dateTime(),
  },
});

export const sessionBoot = defineEndpoint("session_boot", {
  description: "Get the latest boot snapshot for a session.",
  params: {
    session_key: p.int32().describe("Session key to fetch."),
  },
  nodes: [
    node({
      name: "latest_boot",
      sql: `
        SELECT
          season,
          meetingKey,
          meetingName,
          sessionKey,
          sessionName,
          sessionType,
          bootSequence,
          generatedAt,
          stateJson
        FROM session_boot_snapshots
        WHERE sessionKey = {{Int32(session_key)}}
        ORDER BY generatedAt DESC
        LIMIT 1
      `,
    }),
  ],
  output: {
    season: t.int32(),
    meetingKey: t.int32(),
    meetingName: t.string(),
    sessionKey: t.int32(),
    sessionName: t.string(),
    sessionType: t.string(),
    bootSequence: t.int64(),
    generatedAt: t.dateTime(),
    stateJson: t.string(),
  },
});

export const replayChunksEndpoint = defineEndpoint("replay_chunks", {
  description: "Fetch replay chunks for historical scrubbing and resume.",
  params: {
    session_key: p.int32().describe("Session key to fetch."),
    from_chunk: p.int32().describe("First chunk index to return."),
    to_chunk: p
      .int32()
      .optional(0)
      .describe("Optional last chunk index, 0 means open-ended."),
    limit: p
      .int32()
      .optional(120)
      .describe("Safety cap for number of chunks returned."),
  },
  nodes: [
    node({
      name: "chunk_rows",
      sql: `
        SELECT
          sessionKey,
          chunkIndex,
          rangeStartSequence,
          rangeEndSequence,
          emittedAt,
          eventsJson
        FROM replay_chunk_records
        WHERE sessionKey = {{Int32(session_key)}}
          AND chunkIndex >= {{Int32(from_chunk)}}
          AND ({{Int32(to_chunk, 0)}} = 0 OR chunkIndex <= {{Int32(to_chunk, 0)}})
        ORDER BY chunkIndex ASC
        LIMIT {{Int32(limit, 120)}}
      `,
    }),
  ],
  output: {
    sessionKey: t.int32(),
    chunkIndex: t.int32(),
    rangeStartSequence: t.int64(),
    rangeEndSequence: t.int64(),
    emittedAt: t.dateTime(),
    eventsJson: t.string(),
  },
});

export const raceControlFeed = defineEndpoint("race_control_feed", {
  description: "Fetch recent race control messages for a session.",
  params: {
    session_key: p.int32().describe("Session key to fetch."),
    limit: p
      .int32()
      .optional(100)
      .describe("Maximum number of messages to return."),
  },
  nodes: [
    node({
      name: "feed_rows",
      sql: `
        SELECT
          sessionKey,
          sequence,
          emittedAt,
          category,
          title,
          body,
          flag,
          scope
        FROM race_control_messages
        WHERE sessionKey = {{Int32(session_key)}}
        ORDER BY sequence DESC
        LIMIT {{Int32(limit, 100)}}
      `,
    }),
  ],
  output: {
    sessionKey: t.int32(),
    sequence: t.int64(),
    emittedAt: t.dateTime(),
    category: t.string(),
    title: t.string(),
    body: t.string(),
    flag: t.string().nullable(),
    scope: t.string().nullable(),
  },
});

export const liveWindow = defineEndpoint("live_window", {
  description: "Fetch recent live envelopes from a monotonic sequence cursor.",
  params: {
    session_key: p.int32().describe("Session key to fetch."),
    from_sequence: p
      .int64()
      .optional(0)
      .describe("Sequence cursor, 0 means from the start."),
    topic_filter: p
      .string()
      .optional("")
      .describe("Optional normalized topic filter, empty means all topics."),
    limit: p.int32().optional(500).describe("Maximum envelopes to return."),
  },
  nodes: [
    node({
      name: "window_rows",
      sql: `
        SELECT
          id,
          sessionKey,
          sequence,
          emittedAt,
          receivedAt,
          mode,
          topic,
          payloadJson
        FROM live_envelopes
        WHERE sessionKey = {{Int32(session_key)}}
          AND sequence >= {{Int64(from_sequence, 0)}}
          AND (
            {{String(topic_filter, '')}} = ''
            OR topic = {{String(topic_filter, '')}}
          )
        ORDER BY sequence ASC
        LIMIT {{Int32(limit, 500)}}
      `,
    }),
  ],
  output: {
    id: t.string(),
    sessionKey: t.int32(),
    sequence: t.int64(),
    emittedAt: t.dateTime(),
    receivedAt: t.dateTime().nullable(),
    mode: t.string(),
    topic: t.string(),
    payloadJson: t.string(),
  },
});

export const liveTopicTimeWindow = defineEndpoint("live_topic_time_window", {
  description:
    "Fetch live envelopes for a session/topic within an emittedAt time window.",
  params: {
    session_key: p.int32().describe("Session key to fetch."),
    topic_filter: p
      .string()
      .optional("")
      .describe("Optional normalized topic filter, empty means all topics."),
    from_time: p
      .dateTime64()
      .optional("")
      .describe("Optional lower bound for emittedAt."),
    to_time: p
      .dateTime64()
      .optional("")
      .describe("Optional upper bound for emittedAt."),
    limit: p.int32().optional(20000).describe("Maximum envelopes to return."),
  },
  nodes: [
    node({
      name: "topic_window_rows",
      sql: `
        SELECT
          id,
          sessionKey,
          sequence,
          emittedAt,
          receivedAt,
          mode,
          topic,
          payloadJson
        FROM live_envelopes
        WHERE sessionKey = {{Int32(session_key)}}
          AND (
            {{String(topic_filter, '')}} = ''
            OR topic = {{String(topic_filter, '')}}
          )
          AND emittedAt >= coalesce(
            parseDateTime64BestEffortOrNull({{String(from_time, '__no_value__')}}, 3),
            toDateTime64('1970-01-01 00:00:00', 3, 'UTC')
          )
          AND emittedAt <= coalesce(
            parseDateTime64BestEffortOrNull({{String(to_time, '__no_value__')}}, 3),
            toDateTime64('2100-01-01 00:00:00', 3, 'UTC')
          )
        ORDER BY emittedAt ASC, sequence ASC
        LIMIT {{Int32(limit, 20000)}}
      `,
    }),
  ],
  output: {
    id: t.string(),
    sessionKey: t.int32(),
    sequence: t.int64(),
    emittedAt: t.dateTime(),
    receivedAt: t.dateTime().nullable(),
    mode: t.string(),
    topic: t.string(),
    payloadJson: t.string(),
  },
});

export const telemetryLapSummariesEndpoint = defineEndpoint(
  "telemetry_lap_summary_list",
  {
    description: "Fetch lap summaries for a session, filtered to one driver.",
    params: {
      session_key: p.int32().describe("Session key to fetch."),
      driver_number: p.int32().describe("Driver number to fetch."),
    },
    nodes: [
      node({
        name: "telemetry_lap_rows",
        sql: `
          SELECT
            sessionKey,
            meetingKey,
            driverNumber,
            lapNumber,
            lapStartTime,
            lapEndTime,
            lapDurationMs,
            sector1Ms,
            sector2Ms,
            sector3Ms,
            isPitOutLap,
            stintNumber,
            compound,
            topSpeed
          FROM telemetry_lap_summaries
          WHERE sessionKey = {{Int32(session_key)}}
            AND driverNumber = {{Int32(driver_number)}}
          ORDER BY lapNumber ASC
        `,
      }),
    ],
    output: {
      sessionKey: t.int32(),
      meetingKey: t.int32(),
      driverNumber: t.int32(),
      lapNumber: t.int32(),
      lapStartTime: t.dateTime64(3, "UTC"),
      lapEndTime: t.dateTime64(3, "UTC").nullable(),
      lapDurationMs: t.int32().nullable(),
      sector1Ms: t.int32().nullable(),
      sector2Ms: t.int32().nullable(),
      sector3Ms: t.int32().nullable(),
      isPitOutLap: t.bool(),
      stintNumber: t.int32().nullable(),
      compound: t.string().nullable(),
      topSpeed: t.int32().nullable(),
    },
  },
);

export const telemetryTraceEndpoint = defineEndpoint(
  "telemetry_trace_samples",
  {
    description: "Fetch telemetry samples for one driver lap.",
    params: {
      session_key: p.int32().describe("Session key to fetch."),
      driver_number: p.int32().describe("Driver number to fetch."),
      lap_number: p.int32().describe("Lap number to fetch."),
    },
    nodes: [
      node({
        name: "telemetry_trace_rows",
        sql: `
        SELECT
          sessionKey,
          meetingKey,
          driverNumber,
          lapNumber,
          emittedAt,
          speed,
          rpm,
          gear,
          throttle,
          brake,
          drs,
          battery
        FROM telemetry_samples
        WHERE sessionKey = {{Int32(session_key)}}
          AND driverNumber = {{Int32(driver_number)}}
          AND lapNumber = {{Int32(lap_number)}}
        ORDER BY emittedAt ASC
      `,
      }),
    ],
    output: {
      sessionKey: t.int32(),
      meetingKey: t.int32(),
      driverNumber: t.int32(),
      lapNumber: t.int32(),
      emittedAt: t.dateTime64(3, "UTC"),
      speed: t.int32().nullable(),
      rpm: t.int32().nullable(),
      gear: t.int32().nullable(),
      throttle: t.int32().nullable(),
      brake: t.int32().nullable(),
      drs: t.int32().nullable(),
      battery: t.int32().nullable(),
    },
  },
);

export const sessionDriverDirectory = defineEndpoint(
  "session_driver_directory",
  {
    description: "Fetch per-session driver directory rows.",
    params: {
      session_key: p.int32().describe("Session key to fetch."),
    },
    nodes: [
      node({
        name: "driver_rows",
        sql: `
        SELECT
          sessionKey,
          meetingKey,
          driverNumber,
          broadcastName,
          fullName,
          nameAcronym,
          teamName,
          teamColor,
          headshotUrl
        FROM session_drivers
        WHERE sessionKey = {{Int32(session_key)}}
        ORDER BY driverNumber ASC
      `,
      }),
    ],
    output: {
      sessionKey: t.int32(),
      meetingKey: t.int32(),
      driverNumber: t.int32(),
      broadcastName: t.string(),
      fullName: t.string(),
      nameAcronym: t.string(),
      teamName: t.string(),
      teamColor: t.string(),
      headshotUrl: t.string().nullable(),
    },
  },
);

export const trackPositionFrameWindow = defineEndpoint(
  "track_position_frame_window",
  {
    description:
      "Fetch historical track frames for a session, optionally filtered by driver and time range.",
    params: {
      session_key: p.int32().describe("Session key to fetch."),
      driver_number: p
        .int32()
        .optional(0)
        .describe("Optional driver number filter, 0 means all drivers."),
      from_time: p
        .dateTime64()
        .optional("")
        .describe("Optional lower bound for frame timestamp."),
      to_time: p
        .dateTime64()
        .optional("")
        .describe("Optional upper bound for frame timestamp."),
      limit: p
        .int32()
        .optional(10000)
        .describe("Maximum number of frames to return."),
    },
    nodes: [
      node({
        name: "frame_rows",
        sql: `
          SELECT
            sessionKey,
            meetingKey,
            driverNumber,
            emittedAt,
            position,
            x,
            y,
            z,
            source
          FROM track_position_frames
          WHERE sessionKey = {{Int32(session_key)}}
            AND ({{Int32(driver_number, 0)}} = 0 OR driverNumber = {{Int32(driver_number, 0)}})
            AND emittedAt >= coalesce(
              parseDateTime64BestEffortOrNull({{String(from_time, '__no_value__')}}, 3),
              toDateTime64('1970-01-01 00:00:00', 3, 'UTC')
            )
            AND emittedAt <= coalesce(
              parseDateTime64BestEffortOrNull({{String(to_time, '__no_value__')}}, 3),
              toDateTime64('2100-01-01 00:00:00', 3, 'UTC')
            )
          ORDER BY emittedAt ASC, driverNumber ASC
          LIMIT {{Int32(limit, 10000)}}
        `,
      }),
    ],
    output: {
      sessionKey: t.int32(),
      meetingKey: t.int32(),
      driverNumber: t.int32(),
      emittedAt: t.dateTime64(3, "UTC"),
      position: t.int32().nullable(),
      x: t.int32().nullable(),
      y: t.int32().nullable(),
      z: t.int32().nullable(),
      source: t.string(),
    },
  },
);

export const trackLatestPositions = defineEndpoint("track_latest_positions", {
  description:
    "Fetch the latest available track frame per driver for a session.",
  params: {
    session_key: p.int32().describe("Session key to fetch."),
  },
  nodes: [
    node({
      name: "latest_rows",
      sql: `
        SELECT
          sessionKey,
          meetingKey,
          driverNumber,
          tupleElement(frame, 1) AS emittedAt,
          tupleElement(frame, 2) AS position,
          tupleElement(frame, 3) AS x,
          tupleElement(frame, 4) AS y,
          tupleElement(frame, 5) AS z,
          tupleElement(frame, 6) AS source
        FROM (
          SELECT
            sessionKey,
            meetingKey,
            driverNumber,
            argMax(
              tuple(emittedAt, position, x, y, z, source),
              emittedAt
            ) AS frame
          FROM track_position_frames
          WHERE sessionKey = {{Int32(session_key)}}
          GROUP BY
            sessionKey,
            meetingKey,
            driverNumber
        )
        ORDER BY position ASC NULLS LAST, driverNumber ASC
      `,
    }),
  ],
  output: {
    sessionKey: t.int32(),
    meetingKey: t.int32(),
    driverNumber: t.int32(),
    emittedAt: t.dateTime64(3, "UTC"),
    position: t.int32().nullable(),
    x: t.int32().nullable(),
    y: t.int32().nullable(),
    z: t.int32().nullable(),
    source: t.string(),
  },
});

export const trackReplayFrame = defineEndpoint("track_replay_frame", {
  description:
    "Fetch one best-match frame per driver around a replay timestamp.",
  params: {
    session_key: p.int32().describe("Session key to fetch."),
    at_time: p
      .dateTime64()
      .describe("Replay timestamp used to pick nearest driver frames."),
    window_ms: p
      .int32()
      .optional(1500)
      .describe("Half-window in milliseconds around replay timestamp."),
  },
  nodes: [
    node({
      name: "window_rows",
      sql: `
        WITH coalesce(
          parseDateTime64BestEffortOrNull({{String(at_time, '__no_value__')}}, 3),
          toDateTime64('1970-01-01 00:00:00', 3, 'UTC')
        ) AS target_time
        SELECT
          sessionKey,
          meetingKey,
          driverNumber,
          tupleElement(frame, 1) AS emittedAt,
          tupleElement(frame, 2) AS position,
          tupleElement(frame, 3) AS x,
          tupleElement(frame, 4) AS y,
          tupleElement(frame, 5) AS z,
          tupleElement(frame, 6) AS source
        FROM (
          SELECT
            sessionKey,
            meetingKey,
            driverNumber,
            argMin(
              tuple(emittedAt, position, x, y, z, source),
              abs(
                dateDiff(
                  'millisecond',
                  emittedAt,
                  target_time
                )
              )
            ) AS frame
          FROM track_position_frames
          WHERE sessionKey = {{Int32(session_key)}}
            AND abs(
              dateDiff(
                'millisecond',
                emittedAt,
                target_time
              )
            ) <= {{Int32(window_ms, 1500)}}
          GROUP BY
            sessionKey,
            meetingKey,
            driverNumber
        )
        ORDER BY position ASC NULLS LAST, driverNumber ASC
      `,
    }),
  ],
  output: {
    sessionKey: t.int32(),
    meetingKey: t.int32(),
    driverNumber: t.int32(),
    emittedAt: t.dateTime64(3, "UTC"),
    position: t.int32().nullable(),
    x: t.int32().nullable(),
    y: t.int32().nullable(),
    z: t.int32().nullable(),
    source: t.string(),
  },
});

export const trackOutline = defineEndpoint("track_outline", {
  description: "Fetch the simplified materialized track outline for a session.",
  params: {
    session_key: p.int32().describe("Session key to fetch."),
  },
  nodes: [
    node({
      name: "outline_rows",
      sql: `
        SELECT
          sessionKey,
          any(meetingKey) AS meetingKey,
          pointIndex,
          any(x) AS x,
          any(y) AS y,
          any(z) AS z,
          any(source) AS source
        FROM track_outline_points
        WHERE sessionKey = {{Int32(session_key)}}
        GROUP BY
          sessionKey,
          pointIndex
        ORDER BY pointIndex ASC
      `,
    }),
  ],
  output: {
    sessionKey: t.int32(),
    meetingKey: t.int32(),
    pointIndex: t.int32(),
    x: t.int32(),
    y: t.int32(),
    z: t.int32().nullable(),
    source: t.string(),
  },
});

export type SessionCatalogParams = InferParams<typeof sessionCatalog>;
export type SessionCatalogOutput = InferOutputRow<typeof sessionCatalog>;
export type SessionSummaryParams = InferParams<typeof sessionSummary>;
export type SessionSummaryOutput = InferOutputRow<typeof sessionSummary>;
export type SessionBootParams = InferParams<typeof sessionBoot>;
export type SessionBootOutput = InferOutputRow<typeof sessionBoot>;
export type ReplayChunksParams = InferParams<typeof replayChunksEndpoint>;
export type ReplayChunksOutput = InferOutputRow<typeof replayChunksEndpoint>;
export type RaceControlFeedParams = InferParams<typeof raceControlFeed>;
export type RaceControlFeedOutput = InferOutputRow<typeof raceControlFeed>;
export type LiveWindowParams = InferParams<typeof liveWindow>;
export type LiveWindowOutput = InferOutputRow<typeof liveWindow>;
export type LiveTopicTimeWindowParams = InferParams<typeof liveTopicTimeWindow>;
export type LiveTopicTimeWindowOutput = InferOutputRow<
  typeof liveTopicTimeWindow
>;
export type TelemetryLapSummariesParams = InferParams<
  typeof telemetryLapSummariesEndpoint
>;
export type TelemetryLapSummariesOutput = InferOutputRow<
  typeof telemetryLapSummariesEndpoint
>;
export type TelemetryTraceParams = InferParams<typeof telemetryTraceEndpoint>;
export type TelemetryTraceOutput = InferOutputRow<
  typeof telemetryTraceEndpoint
>;
export type SessionDriverDirectoryParams = InferParams<
  typeof sessionDriverDirectory
>;
export type SessionDriverDirectoryOutput = InferOutputRow<
  typeof sessionDriverDirectory
>;
export type TrackPositionFrameWindowParams = InferParams<
  typeof trackPositionFrameWindow
>;
export type TrackPositionFrameWindowOutput = InferOutputRow<
  typeof trackPositionFrameWindow
>;
export type TrackLatestPositionsParams = InferParams<
  typeof trackLatestPositions
>;
export type TrackLatestPositionsOutput = InferOutputRow<
  typeof trackLatestPositions
>;
export type TrackReplayFrameParams = InferParams<typeof trackReplayFrame>;
export type TrackReplayFrameOutput = InferOutputRow<typeof trackReplayFrame>;
export type TrackOutlineParams = InferParams<typeof trackOutline>;
export type TrackOutlineOutput = InferOutputRow<typeof trackOutline>;

export const tinybird = new Tinybird({
  datasources: {
    rawTopicEvents,
    helloTinybird,
    f1Sessions,
    sessionSummaries,
    liveEnvelopes,
    raceControlMessages,
    sessionBootSnapshots,
    sessionDrivers,
    trackPositionFrames,
    trackOutlinePoints,
    replayChunkRecords,
    telemetryLapSummariesDatasource,
    telemetrySamplesDatasource,
  },
  pipes: {
    sessionCatalog,
    sessionSummary,
    sessionBoot,
    replayChunks: replayChunksEndpoint,
    raceControlFeed,
    liveWindow,
    liveTopicTimeWindow,
    telemetryLapSummaries: telemetryLapSummariesEndpoint,
    telemetryTrace: telemetryTraceEndpoint,
    sessionDriverDirectory,
    trackPositionFrameWindow,
    trackLatestPositions,
    trackReplayFrame,
    trackOutline,
  },
});
