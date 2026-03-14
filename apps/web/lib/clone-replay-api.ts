import {
  fetchSessionBoot,
  fetchSessionCatalogMeta,
  fetchSessionDrivers,
  fetchTrackOutline,
  fetchTrackPositionFrames,
} from "@/lib/api";
import { getWeather } from "@/lib/session-insights";

export interface ReplayDriverState {
  abbr: string;
  x: number;
  y: number;
  position: number | null;
  gap: string | null;
  interval: string | null;
  compound: string | null;
  tyre_life: number | null;
  tyre_history: string[];
  pit_stops: number;
  grid_position: number | null;
  speed: number;
  gear: number;
  drs: number;
  in_pit: boolean;
  retired: boolean;
  has_fastest_lap: boolean;
  flag: string | null;
}

export interface ReplayRaceControl {
  message: string;
  flag: string;
  category: string;
}

export interface ReplayWeather {
  air_temp: number | null;
  track_temp: number | null;
  humidity: number | null;
  rainfall: boolean;
  wind_speed: number | null;
  wind_direction: number | null;
}

export interface ReplayFrame {
  timestamp: number;
  lap: number;
  total_laps: number;
  track_status: string;
  drivers: ReplayDriverState[];
  weather?: ReplayWeather;
  race_control?: ReplayRaceControl[];
}

export interface ReplayTrack {
  x: number[];
  y: number[];
  rotation: number;
  sector_boundaries: {
    s1_end: number;
    s2_end: number;
    total: number;
  } | null;
  norm: { x_min: number; y_min: number; scale: number };
}

export interface ReplaySessionInfo {
  year: number;
  event: string;
  session_type: string;
  total_laps: number;
  is_race: boolean;
  circuit_name: string;
  event_name: string;
}

export interface ReplayDriverInfo {
  abbr: string;
  full_name: string;
  team: string;
  color: string;
  number: string;
  headshotUrl?: string;
}

export interface ReplayCompletedLap {
  driver: string;
  lap: number;
  time_str: string;
  seconds: number;
  timestamp: number;
  compound: string;
}

export interface ReplayChunkManifest {
  id: number;
  start: number;
  end: number;
  count: number;
}

export interface ReplayMetadata {
  track: ReplayTrack;
  session_info: ReplaySessionInfo;
  drivers: Record<string, ReplayDriverInfo>;
  driver_colors: Record<string, string>;
  completed_laps: ReplayCompletedLap[];
  chunk_manifest: ReplayChunkManifest[];
  total_duration: number;
}

export interface ReplayChunk {
  chunk_id: number;
  start_time: number;
  end_time: number;
  frames: ReplayFrame[];
}

type ReplayContext = {
  sessionStartIso: string;
  sessionStartMs: number;
  lastFrameIso: string;
  lastFrameMs: number;
  drivers: Awaited<ReturnType<typeof fetchSessionDrivers>>["data"];
  outlinePoints: Awaited<ReturnType<typeof fetchTrackOutline>>["data"];
  outlineFrames: Awaited<ReturnType<typeof fetchTrackPositionFrames>>["data"];
  boot: Awaited<ReturnType<typeof fetchSessionBoot>>;
  meta: Awaited<ReturnType<typeof fetchSessionCatalogMeta>>;
};

function getSessionStartTime(boot: Awaited<ReturnType<typeof fetchSessionBoot>>) {
  const sessionInfo = boot?.state?.SessionInfo;
  if (!sessionInfo || typeof sessionInfo !== "object") return undefined;
  const record = sessionInfo as Record<string, unknown>;
  const startDate = record.StartDate;
  const gmtOffset = record.GmtOffset;
  if (typeof startDate !== "string" || startDate.length === 0) return undefined;
  if (typeof gmtOffset !== "string" || !/^[-+]?\d{2}:\d{2}:\d{2}$/.test(gmtOffset)) return startDate;
  const match = gmtOffset.match(/^([+-]?)(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return startDate;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[2] ?? "0", 10);
  const minutes = Number.parseInt(match[3] ?? "0", 10);
  const seconds = Number.parseInt(match[4] ?? "0", 10);
  const offsetMs = sign * (((hours * 60 + minutes) * 60 + seconds) * 1000);
  const localDate = new Date(`${startDate}${startDate.endsWith("Z") ? "" : "Z"}`);
  if (Number.isNaN(localDate.getTime())) return startDate;
  return new Date(localDate.getTime() - offsetMs).toISOString();
}

function buildChunkManifest(startMs: number, endMs: number, chunkSeconds = 120): ReplayChunkManifest[] {
  const totalDuration = Math.max(0, (endMs - startMs) / 1000);
  const count = Math.max(1, Math.ceil(totalDuration / chunkSeconds));
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    start: index * chunkSeconds,
    end: Math.min((index + 1) * chunkSeconds, totalDuration),
    count: 0,
  }));
}

function buildTrack(
  outlineFrames: ReplayContext["outlineFrames"],
  outlinePoints: ReplayContext["outlinePoints"],
): ReplayTrack {
  const source = outlineFrames.length >= 20
    ? outlineFrames.filter((row) => row.x != null && row.y != null)
    : outlinePoints.filter((row) => row.x != null && row.y != null);
  const xs = source.map((row) => row.x as number);
  const ys = source.map((row) => row.y as number);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.max(maxX - minX, maxY - minY) || 1;

  return {
    x: xs.map((value) => (value - minX) / scale),
    y: ys.map((value) => (value - minY) / scale),
    rotation: 0,
    sector_boundaries: null,
    norm: { x_min: minX, y_min: minY, scale },
  };
}

async function getReplayContext(sessionKey: number): Promise<ReplayContext> {
  const boot = await fetchSessionBoot(sessionKey);
  const meta = await fetchSessionCatalogMeta(sessionKey);
  const drivers = (await fetchSessionDrivers(sessionKey)).data;
  const outlinePoints = (await fetchTrackOutline(sessionKey)).data;
  const outlineDriverNumber = drivers[0]?.driverNumber;
  const sessionStartIso = getSessionStartTime(boot) ?? meta.startsAt;
  const lastFrameIso = meta.lastFrameAt ?? meta.startsAt;
  const outlineFrames = outlineDriverNumber
    ? (await fetchTrackPositionFrames(sessionKey, {
        driverNumber: outlineDriverNumber,
        fromTime: sessionStartIso,
        toTime: lastFrameIso,
        limit: 8000,
      })).data
    : [];

  return {
    sessionStartIso,
    sessionStartMs: Date.parse(sessionStartIso),
    lastFrameIso,
    lastFrameMs: Date.parse(lastFrameIso),
    drivers,
    outlinePoints,
    outlineFrames,
    boot,
    meta,
  };
}

function buildDriverMaps(drivers: ReplayContext["drivers"]) {
  const info: Record<string, ReplayDriverInfo> = {};
  const colors: Record<string, string> = {};
  for (const driver of drivers) {
    const abbr = driver.nameAcronym ?? String(driver.driverNumber);
    info[abbr] = {
      abbr,
      full_name: driver.broadcastName ?? driver.fullName,
      team: driver.teamName,
      color: `#${driver.teamColor}`,
      number: String(driver.driverNumber),
      headshotUrl: driver.headshotUrl,
    };
    colors[abbr] = `#${driver.teamColor}`;
  }
  return { info, colors };
}

export async function fetchReplayMetadataForClone(sessionKey: number): Promise<ReplayMetadata> {
  const context = await getReplayContext(sessionKey);
  const track = buildTrack(context.outlineFrames, context.outlinePoints);
  const { info, colors } = buildDriverMaps(context.drivers);
  const manifest = buildChunkManifest(context.sessionStartMs, context.lastFrameMs);
  const weather = getWeather(context.boot);
  const lapCountRecord = context.boot.state?.LapCount as Record<string, unknown> | undefined;
  const totalLaps = typeof lapCountRecord?.TotalLaps === "number"
    ? lapCountRecord.TotalLaps
    : 0;

  return {
    track,
    session_info: {
      year: new Date(context.meta.startsAt).getUTCFullYear(),
      event: context.meta.meetingName,
      session_type: context.meta.sessionName,
      total_laps: totalLaps,
      is_race: context.meta.sessionType === "Race",
      circuit_name: context.meta.meetingName,
      event_name: context.meta.meetingName,
    },
    drivers: info,
    driver_colors: colors,
    completed_laps: [],
    chunk_manifest: manifest,
    total_duration: Math.max(0, (context.lastFrameMs - context.sessionStartMs) / 1000),
  };
}

export async function fetchReplayChunkForClone(sessionKey: number, chunkId: number): Promise<ReplayChunk> {
  const context = await getReplayContext(sessionKey);
  const metadata = await fetchReplayMetadataForClone(sessionKey);
  const chunk = metadata.chunk_manifest.find((entry) => entry.id === chunkId);
  if (!chunk) {
    return { chunk_id: chunkId, start_time: 0, end_time: 0, frames: [] };
  }

  const fromTime = new Date(context.sessionStartMs + chunk.start * 1000).toISOString();
  const toTime = new Date(context.sessionStartMs + chunk.end * 1000).toISOString();
  const rows = (await fetchTrackPositionFrames(sessionKey, {
    fromTime,
    toTime,
    limit: 25_000,
  })).data;

  const weather = getWeather(context.boot);
  const totalLaps = metadata.session_info.total_laps;
  const byTime = new Map<string, typeof rows>();
  for (const row of rows) {
    if (row.x == null || row.y == null) continue;
    const current = byTime.get(row.emittedAt) ?? [];
    current.push(row);
    byTime.set(row.emittedAt, current);
  }
  const driverInfoByNumber = new Map(context.drivers.map((driver) => [driver.driverNumber, driver] as const));
  const frames: ReplayFrame[] = [...byTime.entries()].map(([emittedAt, frameRows]) => ({
    timestamp: Math.max(0, (Date.parse(emittedAt) - context.sessionStartMs) / 1000),
      lap: 0,
    total_laps: totalLaps,
    track_status: "green",
    weather: {
      air_temp: weather?.airTemp == null ? null : Number(weather.airTemp),
      track_temp: weather?.trackTemp == null ? null : Number(weather.trackTemp),
      humidity: weather?.humidity == null ? null : Number(weather.humidity),
      rainfall: weather?.rainfall === "true",
      wind_speed: weather?.windSpeed == null ? null : Number(weather.windSpeed),
      wind_direction: null,
    },
    race_control: [],
    drivers: frameRows.map((row) => {
      const driver = driverInfoByNumber.get(row.driverNumber);
      const abbr = driver?.nameAcronym ?? String(row.driverNumber);
      return {
        abbr,
        x: ((row.x ?? 0) - metadata.track.norm.x_min) / metadata.track.norm.scale,
        y: ((row.y ?? 0) - metadata.track.norm.y_min) / metadata.track.norm.scale,
        position: row.position ?? null,
        gap: null,
        interval: null,
        compound: null,
        tyre_life: null,
        tyre_history: [],
        pit_stops: 0,
        grid_position: null,
        speed: 0,
        gear: 0,
        drs: 0,
        in_pit: false,
        retired: false,
        has_fastest_lap: false,
        flag: null,
      };
    }),
  })).sort((left, right) => left.timestamp - right.timestamp);

  return {
    chunk_id: chunkId,
    start_time: chunk.start,
    end_time: chunk.end,
    frames,
  };
}
