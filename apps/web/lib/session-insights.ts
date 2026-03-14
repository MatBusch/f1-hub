import {
  type SessionBoot,
  type SessionDriver,
  type TrackOutlinePoint,
  type TrackPositionFrame,
} from "@f1-hub/contracts";
import { findCircuitMap, type CircuitMapSpec } from "./circuit-map";

type DriverEntry = {
  racingNumber: string;
  position: number;
  name: string;
  teamName: string;
  teamColor: string;
  shortCode?: string;
  headshotUrl?: string;
  gapToLeader?: string;
  intervalToAhead?: string;
  lastLapTime?: string;
  bestLapTime?: string;
  numberOfPitStops?: number;
  numberOfLaps?: number;
  currentStintLaps?: number;
  inPit?: boolean;
  retired?: boolean;
  stopped?: boolean;
  currentCompound?: string;
  sectors: SectorEntry[];
  speedTrap?: number;
};

type SectorEntry = {
  value?: string;
  overallFastest: boolean;
  personalFastest: boolean;
  stopped: boolean;
};

type WeatherEntry = {
  airTemp?: string;
  trackTemp?: string;
  humidity?: string;
  windSpeed?: string;
  rainfall?: string;
};

type SessionStateEntry = {
  clock?: string;
  sessionStatus?: string;
  trackStatus?: string;
  trackMessage?: string;
};

type StintEntry = {
  racingNumber: string;
  name: string;
  teamName: string;
  teamColor: string;
  currentCompound?: string;
  totalStints: number;
  lastStintLaps?: number;
  lastLapNumber?: number;
  gridPos?: string;
};

type DriverStatusBreakdown = {
  running: number;
  inPit: number;
  retired: number;
  stopped: number;
};

type CompoundBreakdownEntry = {
  compound: string;
  count: number;
};

type BootTopicCoverageEntry = {
  key: string;
  label: string;
  available: boolean;
};

type SessionBenchmarkEntry = {
  driverName: string;
  teamColor: string;
  racingNumber: string;
  value: string;
  numericValue?: number;
};

type SessionBenchmarks = {
  fastestLap: SessionBenchmarkEntry | null;
  topSpeed: SessionBenchmarkEntry | null;
  sectorLeaders: Array<SessionBenchmarkEntry | null>;
};

export type TrackSurfaceMarker = {
  racingNumber: string;
  position: number;
  name: string;
  shortCode: string;
  teamName: string;
  teamColor: string;
  currentCompound?: string;
  gapToLeader?: string;
  numberOfLaps?: number;
  headshotUrl?: string;
  lastLapTime?: string;
  bestLapTime?: string;
  progress?: number;
  xPercent?: number;
  yPercent?: number;
};

export type TrackSurfaceModel = {
  circuit?: CircuitMapSpec;
  title: string;
  subtitle: string;
  currentLap?: number;
  totalLaps?: number;
  layout: "circuit-path" | "coordinate-map";
  mode: "position-live" | "historical-position" | "classification-estimate";
  markers: TrackSurfaceMarker[];
  pathPoints?: Array<{ xPercent: number; yPercent: number }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function parseLapTimeToMs(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const [minutesPart, secondsPart] = value.split(":");

  if (!minutesPart || !secondsPart) {
    return undefined;
  }

  const minutes = Number.parseInt(minutesPart, 10);
  const seconds = Number.parseFloat(secondsPart);

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return undefined;
  }

  return minutes * 60_000 + Math.round(seconds * 1000);
}

function parseSpeedValue(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function parseLapGap(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const match = value.match(/(\d+)L/);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hasTrackCoordinates(
  frame: Pick<TrackPositionFrame, "x" | "y" | "z"> | null | undefined,
) {
  if (!frame || frame.x === null || frame.y === null) {
    return false;
  }

  return !(frame.x === 0 && frame.y === 0 && (frame.z ?? 0) === 0);
}

function dedupeTrackFramesByDriver(frames: TrackPositionFrame[]) {
  const latestByDriver = new Map<number, TrackPositionFrame>();

  for (const frame of frames) {
    const current = latestByDriver.get(frame.driverNumber);

    if (!current) {
      latestByDriver.set(frame.driverNumber, frame);
      continue;
    }

    if (frame.emittedAt > current.emittedAt) {
      latestByDriver.set(frame.driverNumber, frame);
      continue;
    }

    if (frame.emittedAt < current.emittedAt) {
      continue;
    }

    const currentHasCoordinates = hasTrackCoordinates(current);
    const nextHasCoordinates = hasTrackCoordinates(frame);
    const currentPosition = current.position ?? Number.MAX_SAFE_INTEGER;
    const nextPosition = frame.position ?? Number.MAX_SAFE_INTEGER;

    if (
      (!currentHasCoordinates && nextHasCoordinates) ||
      (currentPosition === Number.MAX_SAFE_INTEGER &&
        nextPosition !== Number.MAX_SAFE_INTEGER) ||
      nextPosition < currentPosition
    ) {
      latestByDriver.set(frame.driverNumber, frame);
    }
  }

  return [...latestByDriver.values()];
}

function normalizeTrackCoordinate(
  x: number,
  y: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
) {
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);

  return {
    xPercent: clamp(((x - bounds.minX) / width) * 100, 4, 96),
    yPercent: clamp((1 - (y - bounds.minY) / height) * 100, 4, 96),
  };
}

function simplifyOutlinePoints(
  points: TrackOutlinePoint[],
  maxPoints = 280,
  minStep = 90,
) {
  if (points.length <= 2) {
    return points;
  }

  const minStepSquared = minStep * minStep;
  const filtered: TrackOutlinePoint[] = [];
  let last = points[0];

  filtered.push(last);

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    const samePoint = point.x === last.x && point.y === last.y;

    if (samePoint) {
      continue;
    }

    if (dx * dx + dy * dy >= minStepSquared) {
      filtered.push(point);
      last = point;
    }
  }

  const tail = points[points.length - 1]!;

  if (
    filtered[filtered.length - 1]!.x !== tail.x ||
    filtered[filtered.length - 1]!.y !== tail.y
  ) {
    filtered.push(tail);
  }

  if (filtered.length <= maxPoints) {
    return filtered;
  }

  const step = Math.ceil(filtered.length / maxPoints);
  const sampled = filtered.filter((_, index) => index % step === 0);

  if (sampled[sampled.length - 1] !== filtered[filtered.length - 1]) {
    sampled.push(filtered[filtered.length - 1]!);
  }

  return sampled;
}

function sortOutlinePoints(points: TrackOutlinePoint[]) {
  return [...points].sort((left, right) => left.pointIndex - right.pointIndex);
}

function getCoordinateBounds(
  points: Array<Pick<TrackOutlinePoint, "x" | "y">>,
) {
  return points.reduce(
    (summary, point) => ({
      minX: Math.min(summary.minX, point.x),
      maxX: Math.max(summary.maxX, point.x),
      minY: Math.min(summary.minY, point.y),
      maxY: Math.max(summary.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
}

function getPathDistance(points: Array<Pick<TrackOutlinePoint, "x" | "y">>) {
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    total += Math.hypot(current.x - previous.x, current.y - previous.y);
  }

  return total;
}

function getMaxSegmentDistance(
  points: Array<Pick<TrackOutlinePoint, "x" | "y">>,
) {
  let maxDistance = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    maxDistance = Math.max(
      maxDistance,
      Math.hypot(current.x - previous.x, current.y - previous.y),
    );
  }

  return maxDistance;
}

function getPathMetrics(points: Array<Pick<TrackOutlinePoint, "x" | "y">>) {
  const cumulativeLengths = [0];
  let totalLength = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    totalLength += Math.hypot(current.x - previous.x, current.y - previous.y);
    cumulativeLengths.push(totalLength);
  }

  return { cumulativeLengths, totalLength };
}

function projectPointToPathProgress(
  point: Pick<TrackPositionFrame, "x" | "y">,
  path: Array<Pick<TrackOutlinePoint, "x" | "y">>,
) {
  if (path.length <= 1 || point.x == null || point.y == null) {
    return undefined;
  }

  const { cumulativeLengths, totalLength } = getPathMetrics(path);

  if (totalLength <= 0) {
    return undefined;
  }

  const pointX = point.x;
  const pointY = point.y;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  let bestLength = 0;

  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1]!;
    const end = path[index]!;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLengthSquared = dx * dx + dy * dy;

    if (segmentLengthSquared <= 0) {
      continue;
    }

    const projection =
      ((pointX - start.x) * dx + (pointY - start.y) * dy) /
      segmentLengthSquared;
    const clampedProjection = clamp(projection, 0, 1);
    const nearestX = start.x + dx * clampedProjection;
    const nearestY = start.y + dy * clampedProjection;
    const distanceSquaredToSegment =
      (pointX - nearestX) * (pointX - nearestX) +
      (pointY - nearestY) * (pointY - nearestY);

    if (distanceSquaredToSegment < bestDistanceSquared) {
      bestDistanceSquared = distanceSquaredToSegment;
      bestLength =
        cumulativeLengths[index - 1]! +
        Math.sqrt(segmentLengthSquared) * clampedProjection;
    }
  }

  return clamp(bestLength / totalLength, 0, 1);
}

function isOutlineCoherent(points: TrackOutlinePoint[]) {
  if (points.length < 8) {
    return false;
  }

  const bounds = getCoordinateBounds(points);
  const diagonal = Math.hypot(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
  );

  if (!Number.isFinite(diagonal) || diagonal < 1) {
    return false;
  }

  const totalDistance = getPathDistance(points);
  const maxSegmentDistance = getMaxSegmentDistance(points);

  return totalDistance / diagonal <= 24 && maxSegmentDistance / diagonal <= 2.6;
}

function extractSingleLapFrames(frames: TrackPositionFrame[]) {
  if (frames.length < 8) {
    return frames;
  }

  const orderedFrames = [...frames].sort((left, right) =>
    left.emittedAt.localeCompare(right.emittedAt),
  );
  const start = orderedFrames[0]!;
  const startX = start.x ?? 0;
  const startY = start.y ?? 0;
  const returnDistanceSquared = 420 * 420;
  const minSamplesBeforeClose = Math.min(
    Math.max(Math.floor(orderedFrames.length * 0.005), 40),
    300,
  );

  let traveledDistance = 0;
  let endIndex = orderedFrames.length - 1;

  for (let index = 1; index < orderedFrames.length; index += 1) {
    const previous = orderedFrames[index - 1]!;
    const current = orderedFrames[index]!;
    const previousX = previous.x ?? 0;
    const previousY = previous.y ?? 0;
    const currentX = current.x ?? 0;
    const currentY = current.y ?? 0;

    traveledDistance += Math.hypot(currentX - previousX, currentY - previousY);

    if (index < minSamplesBeforeClose) {
      continue;
    }

    const startDeltaX = currentX - startX;
    const startDeltaY = currentY - startY;
    const returnedNearStart =
      startDeltaX * startDeltaX + startDeltaY * startDeltaY <=
      returnDistanceSquared;

    if (returnedNearStart && traveledDistance > 6000) {
      endIndex = index;
      break;
    }
  }

  return orderedFrames.slice(0, endIndex + 1);
}

export function getLeaderboard(boot: SessionBoot | undefined): DriverEntry[] {
  if (!boot) {
    return [];
  }

  const timingData = asRecord(boot.state.TimingData);
  const driverList = asRecord(boot.state.DriverList);
  const timingApp = asRecord(boot.state.TimingAppData);
  const lines = asRecord(timingData?.Lines);
  const timingAppLines = asRecord(timingApp?.Lines);

  if (!lines) {
    return [];
  }

  const drivers = Object.values(lines)
    .map((line) => {
      const lineRecord = asRecord(line);
      const positionRaw = asString(lineRecord?.Position);
      const racingNumber = asString(lineRecord?.RacingNumber);

      if (!lineRecord || !positionRaw || !racingNumber) {
        return null;
      }

      const driver = asRecord(driverList?.[racingNumber]);
      const timingAppLine = asRecord(timingAppLines?.[racingNumber]);
      const stints = Array.isArray(timingAppLine?.Stints)
        ? timingAppLine.Stints.map((stint) => asRecord(stint)).filter(
            (stint): stint is Record<string, unknown> => stint !== null,
          )
        : [];
      const latestStint = stints[stints.length - 1];
      const bestLapTime = asRecord(lineRecord.BestLapTime);
      const lastLapTime = asRecord(lineRecord.LastLapTime);
      const intervalToAhead = asRecord(lineRecord.IntervalToPositionAhead);
      const speeds = asRecord(lineRecord.Speeds);
      const pitStopsRaw = lineRecord.NumberOfPitStops;
      const sectors = Array.isArray(lineRecord.Sectors)
        ? lineRecord.Sectors.map((sector) => {
            const sectorRecord = asRecord(sector);

            return {
              value: asString(sectorRecord?.Value),
              overallFastest: sectorRecord?.OverallFastest === true,
              personalFastest: sectorRecord?.PersonalFastest === true,
              stopped: sectorRecord?.Stopped === true,
            } satisfies SectorEntry;
          })
        : [];

      return {
        racingNumber,
        position: Number.parseInt(positionRaw, 10),
        name:
          asString(driver?.BroadcastName) ??
          asString(driver?.Tla) ??
          racingNumber,
        teamName: asString(driver?.TeamName) ?? "Unknown team",
        teamColor: asString(driver?.TeamColour) ?? "9A9A9A",
        shortCode: asString(driver?.Tla),
        headshotUrl: asString(driver?.HeadshotUrl),
        gapToLeader: asString(lineRecord.GapToLeader),
        intervalToAhead: asString(intervalToAhead?.Value),
        lastLapTime: asString(lastLapTime?.Value),
        bestLapTime: asString(bestLapTime?.Value),
        numberOfPitStops:
          typeof pitStopsRaw === "number" ? pitStopsRaw : undefined,
        numberOfLaps:
          typeof lineRecord.NumberOfLaps === "number"
            ? lineRecord.NumberOfLaps
            : undefined,
        currentStintLaps:
          typeof latestStint?.TotalLaps === "number"
            ? latestStint.TotalLaps
            : undefined,
        inPit: lineRecord.InPit === true,
        retired: lineRecord.Retired === true,
        stopped: lineRecord.Stopped === true,
        currentCompound: asString(latestStint?.Compound),
        sectors,
        speedTrap: parseSpeedValue(asString(asRecord(speeds?.ST)?.Value)),
      } satisfies DriverEntry;
    })
    .flatMap((entry) =>
      entry && Number.isFinite(entry.position) ? [entry] : [],
    )
    .sort((left, right) => left.position - right.position);

  return drivers;
}

export function getWeather(boot: SessionBoot | undefined): WeatherEntry | null {
  const weather = asRecord(boot?.state.WeatherData);

  if (!weather) {
    return null;
  }

  return {
    airTemp: asString(weather.AirTemp),
    trackTemp: asString(weather.TrackTemp),
    humidity: asString(weather.Humidity),
    windSpeed: asString(weather.WindSpeed),
    rainfall: asString(weather.Rainfall),
  };
}

export function getSessionState(
  boot: SessionBoot | undefined,
): SessionStateEntry | null {
  const clock = asRecord(boot?.state.ExtrapolatedClock);
  const sessionStatus = asRecord(boot?.state.SessionStatus);
  const trackStatus = asRecord(boot?.state.TrackStatus);

  if (!clock && !sessionStatus && !trackStatus) {
    return null;
  }

  return {
    clock: asString(clock?.Remaining),
    sessionStatus:
      asString(sessionStatus?.Status) ?? asString(sessionStatus?.Started),
    trackStatus: asString(trackStatus?.Status),
    trackMessage: asString(trackStatus?.Message),
  };
}

export function getStintOverview(boot: SessionBoot | undefined): StintEntry[] {
  if (!boot) {
    return [];
  }

  const timingApp = asRecord(boot.state.TimingAppData);
  const driverList = asRecord(boot.state.DriverList);
  const lines = asRecord(timingApp?.Lines);

  if (!lines) {
    return [];
  }

  return Object.values(lines)
    .map((line) => {
      const lineRecord = asRecord(line);
      const racingNumber = asString(lineRecord?.RacingNumber);

      if (!lineRecord || !racingNumber) {
        return null;
      }

      const stints = Array.isArray(lineRecord.Stints)
        ? lineRecord.Stints.map((stint) => asRecord(stint)).filter(
            (stint): stint is Record<string, unknown> => stint !== null,
          )
        : [];
      const latestStint = stints[stints.length - 1];
      const driver = asRecord(driverList?.[racingNumber]);

      return {
        racingNumber,
        name:
          asString(driver?.BroadcastName) ??
          asString(driver?.Tla) ??
          racingNumber,
        teamName: asString(driver?.TeamName) ?? "Unknown team",
        teamColor: asString(driver?.TeamColour) ?? "9A9A9A",
        currentCompound: asString(latestStint?.Compound),
        totalStints: stints.length,
        lastStintLaps:
          typeof latestStint?.TotalLaps === "number"
            ? latestStint.TotalLaps
            : undefined,
        lastLapNumber:
          typeof latestStint?.LapNumber === "number"
            ? latestStint.LapNumber
            : undefined,
        gridPos: asString(lineRecord.GridPos),
      } satisfies StintEntry;
    })
    .flatMap((entry) => (entry ? [entry] : []))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getDriverStatusBreakdown(
  boot: SessionBoot | undefined,
): DriverStatusBreakdown {
  const leaderboard = getLeaderboard(boot);

  return leaderboard.reduce<DriverStatusBreakdown>(
    (summary, driver) => {
      if (driver.retired) {
        summary.retired += 1;
        return summary;
      }

      if (driver.stopped) {
        summary.stopped += 1;
        return summary;
      }

      if (driver.inPit) {
        summary.inPit += 1;
        return summary;
      }

      summary.running += 1;
      return summary;
    },
    { running: 0, inPit: 0, retired: 0, stopped: 0 },
  );
}

export function getCompoundBreakdown(
  boot: SessionBoot | undefined,
): CompoundBreakdownEntry[] {
  const counts = new Map<string, number>();

  for (const stint of getStintOverview(boot)) {
    const compound = stint.currentCompound ?? "Unknown";
    counts.set(compound, (counts.get(compound) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([compound, count]) => ({ compound, count }))
    .sort((left, right) => right.count - left.count);
}

export function getBootTopicCoverage(
  boot: SessionBoot | undefined,
): BootTopicCoverageEntry[] {
  const state = boot?.state ?? {};
  const criticalTopics = [
    ["SessionInfo", "Session metadata"],
    ["DriverList", "Driver list"],
    ["TimingData", "Timing"],
    ["TimingAppData", "Tyre and stint data"],
    ["WeatherData", "Weather"],
    ["TrackStatus", "Track status"],
    ["SessionStatus", "Session status"],
    ["RaceControlMessages", "Race control"],
  ] as const;

  return criticalTopics.map(([key, label]) => ({
    key,
    label,
    available: key in state,
  }));
}

export function getSessionBenchmarks(
  boot: SessionBoot | undefined,
): SessionBenchmarks {
  if (!boot) {
    return {
      fastestLap: null,
      topSpeed: null,
      sectorLeaders: [null, null, null],
    };
  }

  const timingStats = asRecord(boot.state.TimingStats);
  const driverList = asRecord(boot.state.DriverList);
  const statsLines = asRecord(timingStats?.Lines);

  if (!statsLines) {
    return {
      fastestLap: null,
      topSpeed: null,
      sectorLeaders: [null, null, null],
    };
  }

  let fastestLap: SessionBenchmarkEntry | null = null;
  let topSpeed: SessionBenchmarkEntry | null = null;
  const sectorLeaders: Array<SessionBenchmarkEntry | null> = [null, null, null];

  for (const line of Object.values(statsLines)) {
    const lineRecord = asRecord(line);
    const racingNumber = asString(lineRecord?.RacingNumber);

    if (!lineRecord || !racingNumber) {
      continue;
    }

    const driver = asRecord(driverList?.[racingNumber]);
    const driverName =
      asString(driver?.BroadcastName) ?? asString(driver?.Tla) ?? racingNumber;
    const teamColor = asString(driver?.TeamColour) ?? "9A9A9A";

    const personalBestLap = asRecord(lineRecord.PersonalBestLapTime);
    const personalBestLapValue = asString(personalBestLap?.Value);
    const personalBestLapMs = parseLapTimeToMs(personalBestLapValue);

    if (
      personalBestLapValue &&
      personalBestLapMs !== undefined &&
      (!fastestLap ||
        (fastestLap.numericValue !== undefined &&
          personalBestLapMs < fastestLap.numericValue))
    ) {
      fastestLap = {
        driverName,
        teamColor,
        racingNumber,
        value: personalBestLapValue,
        numericValue: personalBestLapMs,
      };
    }

    const bestSpeeds = asRecord(lineRecord.BestSpeeds);
    const speedTrapValue = parseSpeedValue(
      asString(asRecord(bestSpeeds?.ST)?.Value),
    );

    if (
      speedTrapValue !== undefined &&
      (!topSpeed ||
        (topSpeed.numericValue !== undefined &&
          speedTrapValue > topSpeed.numericValue))
    ) {
      topSpeed = {
        driverName,
        teamColor,
        racingNumber,
        value: `${speedTrapValue} km/h`,
        numericValue: speedTrapValue,
      };
    }

    const bestSectors = Array.isArray(lineRecord.BestSectors)
      ? lineRecord.BestSectors.map((sector) => asRecord(sector))
      : [];

    for (const [index, sector] of bestSectors.entries()) {
      if (index > 2 || !sector) {
        continue;
      }

      const value = asString(sector.Value);
      const numericValue = parseLapTimeToMs(`0:${value}`);

      if (!value || numericValue === undefined) {
        continue;
      }

      const currentLeader = sectorLeaders[index];

      if (
        !currentLeader ||
        (currentLeader.numericValue !== undefined &&
          numericValue < currentLeader.numericValue)
      ) {
        sectorLeaders[index] = {
          driverName,
          teamColor,
          racingNumber,
          value,
          numericValue,
        };
      }
    }
  }

  return {
    fastestLap,
    topSpeed,
    sectorLeaders,
  };
}

export function getTrackSurfaceModel(
  boot: SessionBoot | undefined,
  hasLivePositionFrames = false,
): TrackSurfaceModel | null {
  if (!boot) {
    return null;
  }

  const sessionInfo = asRecord(boot.state.SessionInfo);
  const meeting = asRecord(sessionInfo?.Meeting);
  const lapCount = asRecord(boot.state.LapCount);
  const circuit = findCircuitMap(sessionInfo);
  const currentLap = asNumber(lapCount?.CurrentLap);
  const totalLaps = asNumber(lapCount?.TotalLaps);
  const leaderboard = getLeaderboard(boot);

  if (leaderboard.length === 0) {
    return null;
  }

  const leaderLaps = leaderboard[0]?.numberOfLaps ?? currentLap ?? totalLaps;
  const totalLapReference =
    totalLaps && totalLaps > 0
      ? totalLaps
      : leaderLaps && leaderLaps > 0
        ? leaderLaps
        : 1;
  const leaderProgress = Math.min(
    0.985,
    Math.max((leaderLaps ?? totalLapReference) / totalLapReference, 0.08),
  );

  const markers = leaderboard.map((driver, index) => {
    const lapDeficit = Math.max(
      (leaderLaps ?? 0) - (driver.numberOfLaps ?? 0),
      0,
    );
    const explicitLapGap = parseLapGap(driver.gapToLeader);
    const inferredProgress =
      leaderProgress -
      lapDeficit / totalLapReference -
      explicitLapGap / totalLapReference -
      index * 0.0045;

    return {
      racingNumber: driver.racingNumber,
      position: driver.position,
      name: driver.name,
      shortCode: driver.shortCode ?? driver.name.slice(0, 3),
      teamName: driver.teamName,
      teamColor: driver.teamColor,
      currentCompound: driver.currentCompound,
      gapToLeader: driver.position === 1 ? "Leader" : driver.gapToLeader,
      numberOfLaps: driver.numberOfLaps,
      headshotUrl: driver.headshotUrl,
      progress: Math.min(0.985, Math.max(inferredProgress, 0.03)),
    } satisfies TrackSurfaceMarker;
  });

  const meetingName = asString(meeting?.Name) ?? circuit.label;
  const location = asString(meeting?.Location) ?? circuit.location;

  return {
    circuit,
    title: meetingName,
    subtitle: location,
    currentLap,
    totalLaps,
    layout: "circuit-path",
    mode: hasLivePositionFrames ? "position-live" : "classification-estimate",
    markers,
  };
}

export function getTrackSurfaceModelFromFrames(input: {
  boot: SessionBoot | undefined;
  displayPositions: TrackPositionFrame[];
  sessionDrivers: SessionDriver[];
  outlinePoints: TrackOutlinePoint[];
  outlineFrames?: TrackPositionFrame[];
}): TrackSurfaceModel | null {
  const {
    boot,
    displayPositions,
    sessionDrivers,
    outlinePoints,
    outlineFrames = [],
  } = input;

  if (displayPositions.length === 0) {
    return null;
  }

  const sessionInfo = asRecord(boot?.state.SessionInfo);
  const meeting = asRecord(sessionInfo?.Meeting);
  const lapCount = asRecord(boot?.state.LapCount);
  const circuit = findCircuitMap(sessionInfo);
  const leaderboard = getLeaderboard(boot);
  const leaderboardByNumber = new Map(
    leaderboard.map((entry) => [entry.racingNumber, entry] as const),
  );
  const driverDirectory = new Map(
    sessionDrivers.map(
      (driver) => [String(driver.driverNumber), driver] as const,
    ),
  );
  const coordinateFrames = dedupeTrackFramesByDriver(displayPositions)
    .filter(hasTrackCoordinates)
    .map((frame) => ({
      ...frame,
      x: frame.x ?? 0,
      y: frame.y ?? 0,
      z: frame.z ?? 0,
    }));

  if (coordinateFrames.length === 0) {
    return null;
  }

  const orderedOutlinePoints = sortOutlinePoints(outlinePoints);
  const derivedOutlineFrames = extractSingleLapFrames(
    outlineFrames.filter(hasTrackCoordinates),
  );
  const derivedOutlinePoints = derivedOutlineFrames.map((frame, index) => ({
    sessionKey: frame.sessionKey,
    meetingKey: frame.meetingKey,
    pointIndex: index,
    x: frame.x ?? 0,
    y: frame.y ?? 0,
    z: frame.z ?? 0,
    source: frame.source,
  }));
  const outlineSource = isOutlineCoherent(orderedOutlinePoints)
    ? orderedOutlinePoints
    : derivedOutlinePoints;

  if (outlineSource.length < 8) {
    return null;
  }

  const bounds = getCoordinateBounds(outlineSource);

  const simplifiedOutline = simplifyOutlinePoints(outlineSource);
  const pathPoints = simplifiedOutline.map((point) =>
    normalizeTrackCoordinate(point.x, point.y, bounds),
  );

  const markers = coordinateFrames
    .sort((left, right) => {
      const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
      const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;

      if (leftPosition === rightPosition) {
        return left.driverNumber - right.driverNumber;
      }

      return leftPosition - rightPosition;
    })
    .map((frame) => {
      const racingNumber = String(frame.driverNumber);
      const driver = driverDirectory.get(racingNumber);
      const leaderboardEntry = leaderboardByNumber.get(racingNumber);
      const coordinates = normalizeTrackCoordinate(frame.x, frame.y, bounds);
      const progress = projectPointToPathProgress(frame, simplifiedOutline);

      return {
        racingNumber,
        position:
          frame.position ??
          leaderboardEntry?.position ??
          Number.MAX_SAFE_INTEGER,
        name:
          driver?.broadcastName ??
          leaderboardEntry?.name ??
          `Driver ${frame.driverNumber}`,
        shortCode:
          driver?.nameAcronym ?? leaderboardEntry?.shortCode ?? racingNumber,
        teamName:
          driver?.teamName ?? leaderboardEntry?.teamName ?? "Unknown team",
        teamColor: driver?.teamColor ?? leaderboardEntry?.teamColor ?? "9A9A9A",
        currentCompound: leaderboardEntry?.currentCompound,
        gapToLeader:
          (frame.position ?? leaderboardEntry?.position) === 1
            ? "Leader"
            : leaderboardEntry?.gapToLeader,
        numberOfLaps: leaderboardEntry?.numberOfLaps,
        headshotUrl: driver?.headshotUrl ?? leaderboardEntry?.headshotUrl,
        lastLapTime: leaderboardEntry?.lastLapTime,
        bestLapTime: leaderboardEntry?.bestLapTime,
        progress,
        ...coordinates,
      } satisfies TrackSurfaceMarker;
    });

  const currentLap = asNumber(lapCount?.CurrentLap);
  const totalLaps = asNumber(lapCount?.TotalLaps);
  const meetingName =
    asString(meeting?.Name) ??
    (sessionDrivers[0]
      ? `Meeting ${sessionDrivers[0].meetingKey}`
      : "Track map");
  const location = asString(meeting?.Location) ?? "Stored track coordinates";
  const liveSources = displayPositions.some(
    (frame) => frame.source === "signalr",
  );

  return {
    circuit,
    title: meetingName,
    subtitle: location,
    currentLap,
    totalLaps,
    layout: "coordinate-map",
    mode: liveSources ? "position-live" : "historical-position",
    markers,
    pathPoints,
  };
}
