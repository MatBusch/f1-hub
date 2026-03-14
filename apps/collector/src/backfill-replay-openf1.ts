import { randomUUID } from "node:crypto";

import { createTinybirdRepository } from "@f1-hub/data";
import {
  type LiveEnvelope,
  type SessionDriver,
  type TelemetryLapSummary,
  type TelemetrySample,
} from "@f1-hub/contracts";

import { getCollectorConfig } from "./config.js";
import {
  deriveMeetingName,
  OpenF1Client,
  type OpenF1CarData,
  type OpenF1Interval,
  type OpenF1Lap,
  type OpenF1Stint,
  type OpenF1Weather,
} from "./openf1.js";
import { TinybirdEventsClient } from "./tinybird-events.js";

type DriverReplayState = {
  interval?: OpenF1Interval;
  completedLap?: OpenF1Lap;
  bestLap?: OpenF1Lap;
};

type DriverTelemetryPoint = {
  speed: number | null;
  gear: number | null;
  rpm: number | null;
  throttle: number | null;
  brake: number | null;
  drs: number | null;
  battery: number | null;
};

type DriverTelemetryFrame = {
  emittedAt: string;
  byDriver: Record<string, DriverTelemetryPoint>;
};

function parseSessionKeyArg() {
  const arg = process.argv.find((value) => value.startsWith("--session-key="));

  if (!arg) {
    throw new Error('Missing required "--session-key" argument.');
  }

  const value = Number.parseInt(arg.slice("--session-key=".length), 10);

  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Invalid "--session-key" argument.');
  }

  return value;
}

function parseIntArg(name: string, fallback: number) {
  const arg = process.argv.find((value) => value.startsWith(`--${name}=`));

  if (!arg) {
    return fallback;
  }

  const value = Number.parseInt(arg.slice(name.length + 3), 10);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid "--${name}" argument.`);
  }

  return value;
}

function formatTimingValue(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return undefined;
  }

  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
}

function formatGapValue(value: string | number | null | undefined) {
  if (value == null) {
    return undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `+${value.toFixed(3)}`;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  return value.startsWith("+") ? value : `+${value}`;
}

function gapSortValue(value: string | number | null | undefined) {
  if (value == null) {
    return 0;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return Number.MAX_SAFE_INTEGER;
  }

  const lapMatch = value.match(/(\d+)/i);

  if (lapMatch) {
    return 1_000_000 + Number.parseInt(lapMatch[1] ?? "0", 10) * 1000;
  }

  const numeric = Number.parseFloat(value.replace(/^\+/, ""));
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
}

function chunk<T>(items: T[], size: number) {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }

  return batches;
}

function withinReplayWindow(
  value: string,
  start: Date,
  end: Date,
  leadMs = 6 * 60 * 60 * 1000,
  tailMs = 2 * 60 * 60 * 1000,
) {
  const emittedAt = new Date(value).getTime();
  return (
    emittedAt >= start.getTime() - leadMs && emittedAt <= end.getTime() + tailMs
  );
}

function mapConcurrent<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
) {
  const results = new Array<TOutput>(items.length);
  let cursor = 0;

  const workers = Array.from({
    length: Math.min(Math.max(concurrency, 1), items.length || 1),
  }).map(async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await mapper(items[index]!, index);
    }
  });

  return Promise.all(workers).then(() => results);
}

function getLapCompletionTime(lap: OpenF1Lap) {
  if (!lap.date_start || lap.lap_duration == null) {
    return null;
  }

  const startedAtMs = Date.parse(lap.date_start);

  if (!Number.isFinite(startedAtMs)) {
    return null;
  }

  return new Date(startedAtMs + lap.lap_duration * 1000).toISOString();
}

function getCurrentStints(
  stintsByDriver: Map<number, OpenF1Stint[]>,
  driverNumber: number,
  completedLapNumber: number,
) {
  const stints = stintsByDriver.get(driverNumber) ?? [];
  const effectiveLap = Math.max(1, completedLapNumber);

  return stints
    .filter((stint) => (stint.lap_start ?? Number.MAX_SAFE_INTEGER) <= effectiveLap)
    .map((stint) => {
      const lapStart = stint.lap_start ?? effectiveLap;
      const lapEnd = stint.lap_end ?? completedLapNumber;
      const totalLaps = Math.max(
        0,
        Math.min(completedLapNumber, lapEnd) - lapStart + 1 + (stint.tyre_age_at_start ?? 0),
      );

      return {
        LapFlags: 0,
        Compound: stint.compound ?? "",
        New: String((stint.tyre_age_at_start ?? 0) === 0),
        TyresNotChanged: "0",
        TotalLaps: totalLaps,
        StartLaps: stint.tyre_age_at_start ?? 0,
        LapNumber: completedLapNumber,
      };
    });
}

function buildDriverDirectory(sessionKey: number, meetingKey: number, meetingName: string, drivers: Awaited<ReturnType<OpenF1Client["getSessionDrivers"]>>): SessionDriver[] {
  return drivers.map((driver) => ({
    sessionKey,
    meetingKey,
    driverNumber: driver.driver_number,
    broadcastName:
      driver.broadcast_name ?? driver.name_acronym ?? `#${driver.driver_number}`,
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

function buildTimingSnapshots(input: {
  sessionKey: number;
  sessionName: string;
  totalLaps: number;
  driverRows: SessionDriver[];
  intervals: OpenF1Interval[];
  laps: OpenF1Lap[];
  stints: OpenF1Stint[];
  startIso: string;
}) {
  const { sessionKey, sessionName, totalLaps, driverRows, intervals, laps, stints, startIso } = input;
  const timestamps = new Set<number>([Date.parse(startIso)]);
  const intervalRows = intervals
    .filter((row) => Number.isFinite(Date.parse(row.date)))
    .sort((left, right) => left.date.localeCompare(right.date));
  const lapEvents = laps
    .map((lap) => ({
      lap,
      completionIso: getLapCompletionTime(lap),
    }))
    .flatMap((entry) =>
      entry.completionIso ? [{ lap: entry.lap, completionIso: entry.completionIso }] : [],
    )
    .sort((left, right) => left.completionIso.localeCompare(right.completionIso));

  for (const row of intervalRows) {
    timestamps.add(Date.parse(row.date));
  }

  for (const entry of lapEvents) {
    timestamps.add(Date.parse(entry.completionIso));
  }

  const orderedTimestamps = [...timestamps]
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const stateByDriver = new Map<number, DriverReplayState>(
    driverRows.map((driver) => [driver.driverNumber, {}]),
  );
  const stintsByDriver = new Map<number, OpenF1Stint[]>();

  for (const stint of stints) {
    const current = stintsByDriver.get(stint.driver_number) ?? [];
    current.push(stint);
    current.sort((left, right) => (left.lap_start ?? 0) - (right.lap_start ?? 0));
    stintsByDriver.set(stint.driver_number, current);
  }

  let intervalIndex = 0;
  let lapIndex = 0;
  const events: LiveEnvelope[] = [];
  let sequence = 0;

  for (const timestampMs of orderedTimestamps) {
    const emittedAt = new Date(timestampMs).toISOString();

    while (
      intervalIndex < intervalRows.length &&
      Date.parse(intervalRows[intervalIndex]!.date) <= timestampMs
    ) {
      const row = intervalRows[intervalIndex]!;
      const state = stateByDriver.get(row.driver_number) ?? {};
      state.interval = row;
      stateByDriver.set(row.driver_number, state);
      intervalIndex += 1;
    }

    while (
      lapIndex < lapEvents.length &&
      Date.parse(lapEvents[lapIndex]!.completionIso) <= timestampMs
    ) {
      const { lap } = lapEvents[lapIndex]!;
      const state = stateByDriver.get(lap.driver_number) ?? {};
      state.completedLap = lap;

      if (
        lap.lap_duration != null &&
        (!state.bestLap ||
          state.bestLap.lap_duration == null ||
          lap.lap_duration < state.bestLap.lap_duration)
      ) {
        state.bestLap = lap;
      }

      stateByDriver.set(lap.driver_number, state);
      lapIndex += 1;
    }

    const orderedDrivers = driverRows
      .map((driver) => {
        const state = stateByDriver.get(driver.driverNumber);
        return {
          driver,
          state,
          sortKey: gapSortValue(state?.interval?.gap_to_leader),
        };
      })
      .sort((left, right) => {
        if (left.sortKey === right.sortKey) {
          return left.driver.driverNumber - right.driver.driverNumber;
        }

        return left.sortKey - right.sortKey;
      });

    const timingLines = Object.fromEntries(
      orderedDrivers.map(({ driver, state }, index) => {
        const completedLap = state?.completedLap;
        const bestLap = state?.bestLap;
        const currentLaps = completedLap?.lap_number ?? 0;

        return [
          String(driver.driverNumber),
          {
            Line: index + 1,
            Position: String(index + 1),
            RacingNumber: String(driver.driverNumber),
            GapToLeader: formatGapValue(state?.interval?.gap_to_leader),
            IntervalToPositionAhead: {
              Value: index === 0 ? undefined : formatGapValue(state?.interval?.interval),
            },
            BestLapTime: { Value: formatTimingValue(bestLap?.lap_duration) ?? "" },
            LastLapTime: { Value: formatTimingValue(completedLap?.lap_duration) ?? "" },
            NumberOfLaps: currentLaps,
            InPit: false,
            Retired: false,
            Stopped: false,
            Sectors: [
              { Value: formatTimingValue(completedLap?.duration_sector_1) ?? "" },
              { Value: formatTimingValue(completedLap?.duration_sector_2) ?? "" },
              { Value: formatTimingValue(completedLap?.duration_sector_3) ?? "" },
            ],
            Speeds: {
              ST: {
                Value:
                  String(
                    bestLap?.st_speed ??
                      completedLap?.st_speed ??
                      "",
                  ),
              },
            },
          },
        ];
      }),
    );

    const timingAppLines = Object.fromEntries(
      orderedDrivers.map(({ driver, state }, index) => {
        const completedLap = state?.completedLap;
        const currentLaps = completedLap?.lap_number ?? 0;

        return [
          String(driver.driverNumber),
          {
            RacingNumber: String(driver.driverNumber),
            Line: index + 1,
            GridPos: String(index + 1),
            Stints: getCurrentStints(
              stintsByDriver,
              driver.driverNumber,
              currentLaps,
            ),
          },
        ];
      }),
    );

    const leaderLaps = orderedDrivers[0]?.state?.completedLap?.lap_number ?? 0;

    for (const [topic, payload] of [
      [
        "timing",
        {
          Lines: timingLines,
          SessionType: sessionName,
        },
      ],
      [
        "timingApp",
        {
          Lines: timingAppLines,
        },
      ],
      [
        "lapCount",
        {
          CurrentLap: leaderLaps,
          TotalLaps: totalLaps,
        },
      ],
    ] as const) {
      sequence += 1;
      events.push({
        id: randomUUID(),
        sessionKey,
        sequence,
        emittedAt,
        receivedAt: emittedAt,
        mode: "patch",
        topic,
        payload,
      });
    }
  }

  return events;
}

function buildWeatherEvents(sessionKey: number, weatherRows: OpenF1Weather[]) {
  return weatherRows
    .filter((row) => Number.isFinite(Date.parse(row.date)))
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((row) => {
      return {
        id: randomUUID(),
        sessionKey,
        sequence: 0,
        emittedAt: new Date(row.date).toISOString(),
        receivedAt: new Date(row.date).toISOString(),
        mode: "patch",
        topic: "weather",
        payload: {
          AirTemp: row.air_temperature == null ? "" : String(row.air_temperature),
          TrackTemp: row.track_temperature == null ? "" : String(row.track_temperature),
          Humidity: row.humidity == null ? "" : String(row.humidity),
          WindSpeed: row.wind_speed == null ? "" : String(row.wind_speed),
          Rainfall: row.rainfall ? "true" : "false",
        },
      } satisfies LiveEnvelope;
    });
}

function buildTelemetryFrames(
  driverRows: SessionDriver[],
  carDataByDriver: Map<number, OpenF1CarData[]>,
  stepMs: number,
) {
  const telemetryByBucket = new Map<number, DriverTelemetryFrame>();

  for (const driver of driverRows) {
    const rows = carDataByDriver.get(driver.driverNumber) ?? [];

    for (const row of rows) {
      const timestampMs = Date.parse(row.date);

      if (!Number.isFinite(timestampMs)) {
        continue;
      }

      const bucketMs = Math.floor(timestampMs / stepMs) * stepMs;
      const current =
        telemetryByBucket.get(bucketMs) ??
        {
          emittedAt: new Date(bucketMs).toISOString(),
          byDriver: {},
        };

      current.byDriver[String(driver.driverNumber)] = {
        speed: row.speed ?? null,
        gear: row.n_gear ?? null,
        rpm: row.rpm ?? null,
        throttle: row.throttle ?? null,
        brake: row.brake ?? null,
        drs: row.drs == null ? null : Math.round(row.drs),
        battery: null,
      };
      telemetryByBucket.set(bucketMs, current);
    }
  }

  return [...telemetryByBucket.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, frame]) => frame);
}

function toMs(value: number | null | undefined) {
  return value == null ? null : Math.round(value * 1000);
}

function getLapEndTime(lap: OpenF1Lap) {
  const completionIso = getLapCompletionTime(lap);
  return completionIso ? new Date(completionIso).toISOString() : null;
}

function getStintForLap(
  stintsByDriver: Map<number, OpenF1Stint[]>,
  driverNumber: number,
  lapNumber: number,
) {
  const stints = stintsByDriver.get(driverNumber) ?? [];

  return (
    stints.find((stint) => {
      const startLap = stint.lap_start ?? 0;
      const endLap = stint.lap_end ?? Number.POSITIVE_INFINITY;
      return lapNumber >= startLap && lapNumber <= endLap;
    }) ?? null
  );
}

function buildTelemetryLapSummaries(
  laps: OpenF1Lap[],
  stintsByDriver: Map<number, OpenF1Stint[]>,
): TelemetryLapSummary[] {
  const lapsByDriver = new Map<number, OpenF1Lap[]>();

  for (const lap of laps) {
    if (!lap.date_start) {
      continue;
    }

    const current = lapsByDriver.get(lap.driver_number) ?? [];
    current.push(lap);
    current.sort((left, right) => left.lap_number - right.lap_number);
    lapsByDriver.set(lap.driver_number, current);
  }

  const summaries: TelemetryLapSummary[] = [];

  for (const [driverNumber, driverLaps] of lapsByDriver.entries()) {
    for (let index = 0; index < driverLaps.length; index += 1) {
      const lap = driverLaps[index]!;
      const nextLap = driverLaps[index + 1];
      const stint = getStintForLap(stintsByDriver, driverNumber, lap.lap_number);
      const lapStartTime = new Date(lap.date_start!).toISOString();
      const lapEndTime =
        getLapEndTime(lap) ??
        (nextLap?.date_start ? new Date(nextLap.date_start).toISOString() : null) ??
        (lap.lap_duration != null
          ? new Date(Date.parse(lap.date_start!) + lap.lap_duration * 1000).toISOString()
          : null);

      summaries.push({
        sessionKey: lap.session_key,
        meetingKey: lap.meeting_key,
        driverNumber,
        lapNumber: lap.lap_number,
        lapStartTime,
        lapEndTime,
        lapDurationMs: toMs(lap.lap_duration),
        sector1Ms: toMs(lap.duration_sector_1),
        sector2Ms: toMs(lap.duration_sector_2),
        sector3Ms: toMs(lap.duration_sector_3),
        isPitOutLap: lap.is_pit_out_lap === true,
        stintNumber: stint?.stint_number ?? null,
        compound: stint?.compound ?? undefined,
        topSpeed: lap.st_speed ?? null,
      });
    }
  }

  return summaries.sort((left, right) => {
    if (left.driverNumber === right.driverNumber) {
      return left.lapNumber - right.lapNumber;
    }

    return left.driverNumber - right.driverNumber;
  });
}

function buildTelemetrySamples(
  lapSummaries: TelemetryLapSummary[],
  carDataByDriver: Map<number, OpenF1CarData[]>,
): TelemetrySample[] {
  const lapsByDriver = new Map<number, TelemetryLapSummary[]>();

  for (const lap of lapSummaries) {
    const current = lapsByDriver.get(lap.driverNumber) ?? [];
    current.push(lap);
    lapsByDriver.set(lap.driverNumber, current);
  }

  const samples: TelemetrySample[] = [];

  for (const [driverNumber, rows] of carDataByDriver.entries()) {
    const driverLaps = lapsByDriver.get(driverNumber) ?? [];

    if (driverLaps.length === 0) {
      continue;
    }

    const sortedRows = [...rows].sort((left, right) =>
      left.date.localeCompare(right.date),
    );
    let lapIndex = 0;

    for (const row of sortedRows) {
      const emittedAtMs = Date.parse(row.date);

      if (!Number.isFinite(emittedAtMs)) {
        continue;
      }

      while (lapIndex < driverLaps.length) {
        const activeLap = driverLaps[lapIndex]!;
        const lapEndMs = activeLap.lapEndTime
          ? Date.parse(activeLap.lapEndTime)
          : Number.POSITIVE_INFINITY;

        if (emittedAtMs <= lapEndMs) {
          break;
        }

        lapIndex += 1;
      }

      const activeLap = driverLaps[lapIndex];

      if (!activeLap) {
        continue;
      }

      const lapStartMs = Date.parse(activeLap.lapStartTime);
      const lapEndMs = activeLap.lapEndTime
        ? Date.parse(activeLap.lapEndTime)
        : Number.POSITIVE_INFINITY;

      if (emittedAtMs < lapStartMs || emittedAtMs > lapEndMs) {
        continue;
      }

      samples.push({
        sessionKey: activeLap.sessionKey,
        meetingKey: activeLap.meetingKey,
        driverNumber,
        lapNumber: activeLap.lapNumber,
        emittedAt: new Date(row.date).toISOString(),
        speed: row.speed ?? null,
        rpm: row.rpm ?? null,
        gear: row.n_gear ?? null,
        throttle: row.throttle ?? null,
        brake: row.brake ?? null,
        drs: row.drs == null ? null : Math.round(row.drs),
        battery: null,
      });
    }
  }

  return samples;
}

const config = getCollectorConfig();
const sessionKey = parseSessionKeyArg();
const chunkSize = parseIntArg("chunk-size", 25);
const telemetryStepMs = parseIntArg("telemetry-step-ms", 1000);
const openF1 = new OpenF1Client();
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

console.log(`[backfill-replay-openf1] session ${sessionKey}`);
console.log(`[backfill-replay-openf1] dry run ${config.dryRun ? "on" : "off"}`);

const session = await openF1.getSessionByKey(sessionKey);

if (!session) {
  throw new Error(`OpenF1 session ${sessionKey} was not found.`);
}

const meetingName = deriveMeetingName(session);
const driverDirectory = buildDriverDirectory(
  sessionKey,
  session.meeting_key,
  meetingName,
  await openF1.getSessionDrivers(sessionKey),
);

if (driverDirectory.length === 0) {
  throw new Error(`OpenF1 returned no drivers for session ${sessionKey}.`);
}

const existingReplay = await repository.getReplayChunks({
  sessionKey,
  fromChunk: 0,
});
const shouldAppendReplay = existingReplay.data.length <= 1;

if (!shouldAppendReplay) {
  console.log(
    `[backfill-replay-openf1] replay chunks already exist for session ${sessionKey}; replay/live_envelopes append will be skipped and only normalized telemetry tables will be refreshed`,
  );
}

const startChunkIndex =
  (existingReplay.data[existingReplay.data.length - 1]?.chunkIndex ?? -1) + 1;
const startSequence =
  (existingReplay.data[existingReplay.data.length - 1]?.rangeEndSequence ?? 0) + 1;
const totalLaps =
  Math.max(
    0,
    ...(await openF1.getSessionLaps(sessionKey)).map((lap) => lap.lap_number),
  ) ?? 0;

const [intervals, laps, stints, weather] = await Promise.all([
  openF1.getSessionIntervals(sessionKey),
  openF1.getSessionLaps(sessionKey),
  openF1.getSessionStints(sessionKey),
  openF1.getSessionWeather(sessionKey),
]);

const start = new Date(session.date_start);
const end = new Date(session.date_end);
const carDataRowsByDriver = new Map<number, OpenF1CarData[]>();
const carDataPages = await mapConcurrent(driverDirectory, 2, async (driver) => {
  const rows = await openF1.getSessionCarData(sessionKey, driver.driverNumber);
  const filtered = rows.filter((row) => withinReplayWindow(row.date, start, end));
  console.log(
    `[backfill-replay-openf1] driver ${driver.driverNumber} car_data=${filtered.length}`,
  );
  return [driver.driverNumber, filtered] as const;
});

for (const [driverNumber, rows] of carDataPages) {
  carDataRowsByDriver.set(driverNumber, rows);
}

const filteredLaps = laps.filter(
  (lap) => lap.date_start && withinReplayWindow(lap.date_start, start, end),
);
const stintsByDriver = new Map<number, OpenF1Stint[]>();

for (const stint of stints) {
  const current = stintsByDriver.get(stint.driver_number) ?? [];
  current.push(stint);
  stintsByDriver.set(stint.driver_number, current);
}

const telemetryLapSummaries = buildTelemetryLapSummaries(
  filteredLaps,
  stintsByDriver,
);
const telemetrySamples = buildTelemetrySamples(
  telemetryLapSummaries,
  carDataRowsByDriver,
);

const timingEvents = buildTimingSnapshots({
  sessionKey,
  sessionName: session.session_name,
  totalLaps,
  driverRows: driverDirectory,
  intervals: intervals.filter((row) => withinReplayWindow(row.date, start, end)),
  laps: filteredLaps,
  stints,
  startIso: new Date(session.date_start).toISOString(),
});
const telemetryFrames = buildTelemetryFrames(
  driverDirectory,
  carDataRowsByDriver,
  telemetryStepMs,
);

let nextSequence = startSequence;
const historicalEvents: LiveEnvelope[] = [];

for (const event of timingEvents) {
  historicalEvents.push({
    ...event,
    sequence: nextSequence,
  });
  nextSequence += 1;
}

for (const event of buildWeatherEvents(
  sessionKey,
  weather.filter((row) => withinReplayWindow(row.date, start, end)),
)) {
  historicalEvents.push(event);
}

for (const frame of telemetryFrames) {
  historicalEvents.push({
    id: randomUUID(),
    sessionKey,
    sequence: nextSequence,
    emittedAt: frame.emittedAt,
    receivedAt: frame.emittedAt,
    mode: "patch",
    topic: "telemetry",
    payload: {
      entries: [
        {
          date: frame.emittedAt,
          cars: frame.byDriver,
        },
      ],
    },
  });
}

historicalEvents.sort((left, right) => {
  if (left.emittedAt === right.emittedAt) {
    return left.topic.localeCompare(right.topic);
  }

  return left.emittedAt.localeCompare(right.emittedAt);
});

for (const [index, event] of historicalEvents.entries()) {
  event.sequence = startSequence + index;
}

if (shouldAppendReplay) {
  for (const [batchIndex, batch] of chunk(historicalEvents, 5000).entries()) {
    const result = await tinybird.appendLiveEnvelopes(batch);
    console.log(
      `[backfill-replay-openf1] live_envelopes batch ${batchIndex + 1}/${Math.max(1, Math.ceil(historicalEvents.length / 5000))}`,
      result,
    );
  }
}

const replayChunks = shouldAppendReplay
  ? chunk(historicalEvents, chunkSize).map((events, index) => ({
      sessionKey,
      chunkIndex: startChunkIndex + index,
      rangeStartSequence: events[0]!.sequence,
      rangeEndSequence: events[events.length - 1]!.sequence,
      emittedAt: events[events.length - 1]!.emittedAt,
      eventsJson: JSON.stringify(events),
    }))
  : [];

console.log(`[backfill-replay-openf1] timing events ${timingEvents.length}`);
console.log(`[backfill-replay-openf1] telemetry frames ${telemetryFrames.length}`);
console.log(
  `[backfill-replay-openf1] telemetry lap summaries ${telemetryLapSummaries.length}`,
);
console.log(
  `[backfill-replay-openf1] telemetry samples ${telemetrySamples.length}`,
);
console.log(`[backfill-replay-openf1] replay chunks ${replayChunks.length}`);

for (const [batchIndex, batch] of chunk(telemetryLapSummaries, 5000).entries()) {
  const result = await tinybird.appendTelemetryLapSummaries(batch);
  console.log(
    `[backfill-replay-openf1] telemetry_lap_summaries batch ${batchIndex + 1}/${Math.max(1, Math.ceil(telemetryLapSummaries.length / 5000))}`,
    result,
  );
}

for (const [batchIndex, batch] of chunk(telemetrySamples, 5000).entries()) {
  const result = await tinybird.appendTelemetrySamples(batch);
  console.log(
    `[backfill-replay-openf1] telemetry_samples batch ${batchIndex + 1}/${Math.max(1, Math.ceil(telemetrySamples.length / 5000))}`,
    result,
  );
}

if (shouldAppendReplay) {
  for (const [batchIndex, batch] of chunk(replayChunks, 50).entries()) {
    const result = await tinybird.appendReplayChunks(batch);
    console.log(
      `[backfill-replay-openf1] chunk batch ${batchIndex + 1}/${Math.max(1, Math.ceil(replayChunks.length / 50))}`,
      result,
    );
  }
}
