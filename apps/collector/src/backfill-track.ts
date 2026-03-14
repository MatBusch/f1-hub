import { createTinybirdRepository } from "@f1-hub/data";
import { type SessionDriver, type TrackPositionFrame } from "@f1-hub/contracts";

import { getCollectorConfig } from "./config.js";
import {
  deriveMeetingName,
  OpenF1Client,
  type OpenF1Lap,
  type OpenF1Location,
  type OpenF1Position,
} from "./openf1.js";
import { buildTrackOutline } from "./track.js";
import { TinybirdEventsClient } from "./tinybird-events.js";

function parseSessionKeyArg() {
  const sessionKeyArg = process.argv.find((arg) =>
    arg.startsWith("--session-key="),
  );

  if (!sessionKeyArg) {
    throw new Error('Missing required "--session-key" argument.');
  }

  const value = Number.parseInt(
    sessionKeyArg.slice("--session-key=".length),
    10,
  );

  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Invalid "--session-key" argument.');
  }

  return value;
}

function hasForceFlag() {
  return process.argv.includes("--force");
}

function formatDateTime64(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid datetime value: ${value}`);
  }

  const pad = (input: number, width = 2) => String(input).padStart(width, "0");

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(
    date.getUTCSeconds(),
  )}.${pad(date.getUTCMilliseconds(), 3)}`;
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

function chunk<T>(items: T[], size: number) {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }

  return batches;
}

function getLapEndTime(lap: OpenF1Lap) {
  if (!lap.date_start || lap.lap_duration == null || lap.lap_duration <= 0) {
    return null;
  }

  return new Date(
    Date.parse(lap.date_start) + Math.round(lap.lap_duration * 1000),
  ).toISOString();
}

function filterFramesToLapWindow(
  frames: TrackPositionFrame[],
  lap: OpenF1Lap,
): TrackPositionFrame[] {
  if (!lap.date_start) {
    return [];
  }

  const lapStart = Date.parse(lap.date_start);
  const lapEnd = getLapEndTime(lap);

  if (!Number.isFinite(lapStart) || !lapEnd) {
    return [];
  }

  const lapEndMs = Date.parse(lapEnd);

  return frames.filter((frame) => {
    const emittedAt = Date.parse(frame.emittedAt);
    return emittedAt >= lapStart && emittedAt <= lapEndMs;
  });
}

function selectOutlineFrames(
  frames: TrackPositionFrame[],
  laps: OpenF1Lap[],
  minimumFrameCount = 80,
) {
  const candidateLaps = laps
    .filter(
      (lap) =>
        lap.date_start &&
        lap.lap_duration != null &&
        lap.lap_duration > 0 &&
        lap.is_pit_out_lap !== true,
    )
    .sort(
      (left, right) =>
        (left.lap_duration ?? Number.POSITIVE_INFINITY) -
        (right.lap_duration ?? Number.POSITIVE_INFINITY),
    );

  for (const lap of candidateLaps) {
    const lapFrames = filterFramesToLapWindow(frames, lap);

    if (lapFrames.length >= minimumFrameCount) {
      return {
        frames: lapFrames,
        lapNumber: lap.lap_number,
      };
    }
  }

  return {
    frames,
    lapNumber: null,
  };
}

async function mapConcurrent<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
) {
  const results = new Array<TOutput>(items.length);
  let cursor = 0;

  const workers = Array.from({
    length: Math.min(concurrency, items.length || 1),
  }).map(async () => {
    for (;;) {
      const current = cursor;
      cursor += 1;

      if (current >= items.length) {
        return;
      }

      results[current] = await mapper(items[current]!, current);
    }
  });

  await Promise.all(workers);
  return results;
}

function mergeTrackFrames(
  locations: OpenF1Location[],
  positions: OpenF1Position[],
): TrackPositionFrame[] {
  const sortedLocations = [...locations].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
  const sortedPositions = [...positions].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
  const frames: TrackPositionFrame[] = [];

  let positionIndex = 0;
  let currentPosition: OpenF1Position | undefined;

  for (const location of sortedLocations) {
    while (
      positionIndex < sortedPositions.length &&
      sortedPositions[positionIndex]!.date <= location.date
    ) {
      currentPosition = sortedPositions[positionIndex];
      positionIndex += 1;
    }

    frames.push({
      sessionKey: location.session_key,
      meetingKey: location.meeting_key,
      driverNumber: location.driver_number,
      emittedAt: new Date(location.date).toISOString(),
      position: currentPosition?.position,
      x: location.x,
      y: location.y,
      z: location.z,
      source: "openf1",
    });
  }

  return frames;
}

const config = getCollectorConfig();
const sessionKey = parseSessionKeyArg();
const force = hasForceFlag();
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

console.log(`[backfill-track] session ${sessionKey}`);
console.log(`[backfill-track] dry run ${config.dryRun ? "on" : "off"}`);

const existingFrames = await repository.getTrackLatestPositions(sessionKey);
const existingDrivers = await repository.getSessionDrivers(sessionKey);
const existingOutline = await repository.getTrackOutline(sessionKey);

const hasExistingFrames = existingFrames.data.length > 0;
const hasExistingDrivers = existingDrivers.data.length > 0;
const hasExistingOutline = existingOutline.data.length > 0;

const session = await openF1.getSessionByKey(sessionKey);

if (!session) {
  throw new Error(`OpenF1 session ${sessionKey} was not found.`);
}

const start = new Date(session.date_start);
const end = new Date(session.date_end);

const drivers = await openF1.getSessionDrivers(sessionKey);

if (drivers.length === 0) {
  throw new Error(`OpenF1 returned no drivers for session ${sessionKey}.`);
}

const driverRows: SessionDriver[] = drivers.map((driver) => ({
  sessionKey,
  meetingKey: session.meeting_key,
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
  teamName: driver.team_name ?? deriveMeetingName(session),
  teamColor: driver.team_colour ?? "9A9A9A",
  headshotUrl: driver.headshot_url ?? undefined,
}));

console.log(`[backfill-track] drivers ${driverRows.length}`);

let trackFrames: TrackPositionFrame[] = [];
let outlineSourceFrames: TrackPositionFrame[] = [];
let outlineSourceDriverNumber: number | null = null;
let outlineSourceLapNumber: number | null = null;

if (!hasExistingFrames || force) {
  const perDriverData = await mapConcurrent(driverRows, 2, async (driver) => {
    const [locations, positions, laps] = await Promise.all([
      openF1.getSessionLocations(sessionKey, driver.driverNumber),
      openF1.getSessionPositions(sessionKey, driver.driverNumber),
      openF1.getSessionLaps(sessionKey, driver.driverNumber),
    ]);

    const filteredLocations = locations.filter((row) =>
      withinReplayWindow(row.date, start, end),
    );
    const filteredPositions = positions.filter((row) =>
      withinReplayWindow(row.date, start, end),
    );
    const filteredLaps = laps.filter(
      (lap) => lap.date_start && withinReplayWindow(lap.date_start, start, end),
    );

    const frames = mergeTrackFrames(filteredLocations, filteredPositions);
    const outlineCandidate = selectOutlineFrames(frames, filteredLaps);

    console.log(
      `[backfill-track] driver ${driver.driverNumber} locations=${filteredLocations.length} positions=${filteredPositions.length} laps=${filteredLaps.length} frames=${frames.length} outlineFrames=${outlineCandidate.frames.length} outlineLap=${outlineCandidate.lapNumber ?? "fallback"}`,
    );

    return {
      driverNumber: driver.driverNumber,
      frames,
      outlineCandidate,
    };
  });

  trackFrames = perDriverData
    .flatMap((entry) => entry.frames)
    .sort((left, right) => {
      if (left.emittedAt === right.emittedAt) {
        return left.driverNumber - right.driverNumber;
      }

      return left.emittedAt.localeCompare(right.emittedAt);
    });

  const outlineSourceEntry =
    perDriverData.find((entry) => entry.outlineCandidate.frames.length >= 80) ??
    perDriverData[0];

  if (outlineSourceEntry) {
    outlineSourceFrames = outlineSourceEntry.outlineCandidate.frames;
    outlineSourceDriverNumber = outlineSourceEntry.driverNumber;
    outlineSourceLapNumber = outlineSourceEntry.outlineCandidate.lapNumber;
  }

  console.log(`[backfill-track] merged frames ${trackFrames.length}`);
} else {
  console.log(
    "[backfill-track] frames already exist, skipping OpenF1 frame fetch",
  );
}

if (!hasExistingDrivers || force) {
  const driverResult = await tinybird.appendSessionDrivers(driverRows);
  console.log("[backfill-track] driver directory append", driverResult);
} else {
  console.log(
    "[backfill-track] driver directory already exists, skipping append",
  );
}

if (trackFrames.length > 0) {
  for (const [batchIndex, batch] of chunk(trackFrames, 5000).entries()) {
    const payload = batch.map((frame) => ({
      ...frame,
      emittedAt: formatDateTime64(frame.emittedAt),
    }));
    const result = await tinybird.appendTrackPositionFrames(payload);

    console.log(
      `[backfill-track] frame batch ${batchIndex + 1}/${Math.max(
        1,
        Math.ceil(trackFrames.length / 5000),
      )}`,
      result,
    );
  }
}

if (!hasExistingOutline || force) {
  if (trackFrames.length === 0) {
    const fallbackDriverNumber = driverRows[0]?.driverNumber;
    const fallbackFrames =
      fallbackDriverNumber === undefined
        ? []
        : (
            await repository.getTrackPositionFrames({
              sessionKey,
              driverNumber: fallbackDriverNumber,
              limit: 50000,
            })
          ).data;
    const fallbackLaps =
      fallbackDriverNumber === undefined
        ? []
        : (
            await openF1.getSessionLaps(sessionKey, fallbackDriverNumber)
          ).filter(
            (lap) =>
              lap.date_start && withinReplayWindow(lap.date_start, start, end),
          );
    const fallbackOutline = selectOutlineFrames(fallbackFrames, fallbackLaps);

    outlineSourceFrames = fallbackOutline.frames;
    outlineSourceDriverNumber = fallbackDriverNumber ?? null;
    outlineSourceLapNumber = fallbackOutline.lapNumber;
  }

  console.log(
    `[backfill-track] outline source driver=${outlineSourceDriverNumber ?? "unknown"} lap=${outlineSourceLapNumber ?? "fallback"} frames=${outlineSourceFrames.length}`,
  );

  const outlinePoints = buildTrackOutline(outlineSourceFrames);
  const outlineResult = await tinybird.appendTrackOutlinePoints(outlinePoints);

  console.log("[backfill-track] track outline append", outlineResult);
} else {
  console.log("[backfill-track] track outline already exists, skipping append");
}
