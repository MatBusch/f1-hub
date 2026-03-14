"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers3,
  Maximize2,
  Minimize2,
  Minus,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
} from "lucide-react";

import NumberFlow from "@number-flow/react";

import {
  fetchRaceControl,
  fetchReplayChunks,
  fetchSessionBoot,
  fetchSessionCatalogMeta,
  fetchSessionDrivers,
  fetchTrackOutline,
  fetchTrackPositionFrames,
} from "@/lib/api";
import {
  getLeaderboard,
  getTrackSurfaceModelFromFrames,
  getWeather,
} from "@/lib/session-insights";
import { ReplayTrackCanvas } from "@/components/replay-track-canvas";
import { TrackCanvas3D } from "@/components/track-canvas-3d";
import { Skeleton } from "@/components/ui/skeleton";
import { getSoftTeamColor } from "@/lib/utils";

const PLAYBACK_SPEEDS = [0.5, 1, 2, 5, 10, 16] as const;

function hasCoordinates(frame: {
  x?: number | null;
  y?: number | null;
  z?: number | null;
}) {
  if (frame.x == null || frame.y == null) return false;
  return !(frame.x === 0 && frame.y === 0 && (frame.z ?? 0) === 0);
}

function getSessionStartTime(
  boot: Awaited<ReturnType<typeof fetchSessionBoot>> | undefined,
) {
  const sessionInfo = boot?.state?.SessionInfo;
  if (!sessionInfo || typeof sessionInfo !== "object") return undefined;
  const record = sessionInfo as Record<string, unknown>;
  const startDate = record.StartDate;
  const gmtOffset = record.GmtOffset;
  if (typeof startDate !== "string" || startDate.length === 0) return undefined;
  if (
    typeof gmtOffset !== "string" ||
    !/^[-+]?\d{2}:\d{2}:\d{2}$/.test(gmtOffset)
  )
    return startDate;
  const match = gmtOffset.match(/^([+-]?)(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return startDate;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[2] ?? "0", 10);
  const minutes = Number.parseInt(match[3] ?? "0", 10);
  const seconds = Number.parseInt(match[4] ?? "0", 10);
  const offsetMs = sign * (((hours * 60 + minutes) * 60 + seconds) * 1000);
  const localDate = new Date(
    `${startDate}${startDate.endsWith("Z") ? "" : "Z"}`,
  );
  if (Number.isNaN(localDate.getTime())) return startDate;
  return new Date(localDate.getTime() - offsetMs).toISOString();
}

function nextIsoTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed + 1).toISOString();
}

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

function findTimelineIndexAtTime(timestamps: number[], targetTime: number) {
  if (timestamps.length === 0 || !Number.isFinite(targetTime)) {
    return 0;
  }

  let low = 0;
  let high = timestamps.length - 1;
  let matchIndex = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midValue = timestamps[mid]!;

    if (midValue <= targetTime) {
      matchIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return matchIndex;
}

function decodeBase64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function normalizePercent(value: number | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (value <= 1) {
    return Math.round(value * 100);
  }

  return Math.round(Math.min(100, Math.max(0, value)));
}

function formatElapsed(
  startIso: string | undefined,
  currentIso: string | undefined,
) {
  if (!startIso || !currentIso) return "0:00:00";
  const ms = Date.parse(currentIso) - Date.parse(startIso);
  if (!Number.isFinite(ms) || ms < 0) return "0:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatClock(iso: string | undefined) {
  if (!iso) return "--:--:-- --";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:-- --";
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function sectorColor(sector: {
  overallFastest?: boolean;
  personalFastest?: boolean;
  value?: string;
}) {
  if (sector.overallFastest) return "text-purple-400";
  if (sector.personalFastest) return "text-emerald-400";
  if (sector.value) return "text-yellow-400";
  return "text-white/40";
}

function hasKnownPosition(position: number | undefined) {
  return position !== undefined && position < Number.MAX_SAFE_INTEGER;
}

function getLapProgress(
  boot: Awaited<ReturnType<typeof fetchSessionBoot>> | undefined,
) {
  const lapCount = asRecord(boot?.state?.LapCount);
  const currentLap = asNumber(lapCount?.CurrentLap);
  const totalLaps = asNumber(lapCount?.TotalLaps);

  return { currentLap, totalLaps };
}

function compoundBadge(compound: string | undefined) {
  switch (compound?.toLowerCase()) {
    case "soft":
      return "bg-red-600 text-white";
    case "medium":
      return "bg-yellow-500 text-black";
    case "hard":
      return "bg-white text-black";
    case "intermediate":
    case "inter":
      return "bg-emerald-500 text-white";
    case "wet":
      return "bg-blue-500 text-white";
    default:
      return "bg-white/20 text-white/60";
  }
}

type ReplayRow = ReturnType<typeof getLeaderboard>[number] & {
  progress?: number;
  replayLap?: number;
  replayStatus?: string;
  liveSpeed?: number;
  liveGear?: number;
  liveRpm?: number;
  liveThrottle?: number;
  liveBrake?: number;
  liveDrs?: number;
  liveBattery?: number;
};

type DriverTelemetrySample = {
  speed?: number;
  gear?: number;
  rpm?: number;
  throttle?: number;
  brake?: number;
  drs?: number;
  battery?: number;
};

type TelemetryFrame = {
  emittedAtMs: number;
  byDriver: Map<string, DriverTelemetrySample>;
};

async function parseTelemetryPayload(
  payload: unknown,
): Promise<TelemetryFrame[]> {
  let decoded: unknown;

  if (typeof payload === "string" && payload.length > 0) {
    try {
      const decompressedStream = new Blob([decodeBase64ToBytes(payload)])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));
      const text = await new Response(decompressedStream).text();
      decoded = JSON.parse(text);
    } catch {
      return [];
    }
  } else if (typeof payload === "object" && payload !== null) {
    decoded = payload;
  } else {
    return [];
  }

  const decodedRecord = asRecord(decoded);
  const frames = Array.isArray(decodedRecord?.entries)
    ? decodedRecord.entries
    : Array.isArray(decodedRecord?.Entries)
      ? decodedRecord.Entries
      : Array.isArray(decodedRecord?.CarData)
        ? decodedRecord.CarData
        : [];

  return frames.flatMap((frame) => {
    const frameRecord = asRecord(frame);
    const emittedAtMs = Date.parse(
      String(
        frameRecord?.date ?? frameRecord?.Utc ?? frameRecord?.Timestamp ?? "",
      ),
    );
    const cars = asRecord(frameRecord?.cars ?? frameRecord?.Cars);

    if (!Number.isFinite(emittedAtMs) || !cars) {
      return [];
    }

    const byDriver = new Map<string, DriverTelemetrySample>();

    for (const [driverNumber, car] of Object.entries(cars)) {
      const channels = asRecord(asRecord(car)?.Channels);
      const carRecord = asRecord(car);
      const speed = asNumber(carRecord?.speed ?? channels?.["1"]);
      const gear = asNumber(carRecord?.gear ?? channels?.["2"]);
      const throttle = normalizePercent(
        asNumber(carRecord?.throttle ?? channels?.["3"]),
      );
      const brake = normalizePercent(
        asNumber(carRecord?.brake ?? channels?.["4"]),
      );
      const rpm = asNumber(carRecord?.rpm ?? channels?.["0"]);
      const drs = asNumber(
        carRecord?.drs ?? channels?.["45"] ?? channels?.["5"],
      );
      const battery = normalizePercent(
        asNumber(
          carRecord?.battery ?? channels?.battery ?? channels?.["battery"],
        ),
      );

      if (
        speed === undefined &&
        gear === undefined &&
        throttle === undefined &&
        brake === undefined &&
        rpm === undefined &&
        drs === undefined &&
        battery === undefined
      ) {
        continue;
      }

      byDriver.set(driverNumber, {
        speed: speed === undefined ? undefined : Math.round(speed),
        gear: gear === undefined ? undefined : Math.round(gear),
        throttle,
        brake,
        rpm: rpm === undefined ? undefined : Math.round(rpm),
        drs: drs === undefined ? undefined : Math.round(drs),
        battery,
      });
    }

    return byDriver.size > 0 ? [{ emittedAtMs, byDriver }] : [];
  });
}

function findTelemetryFrameAtTime(
  telemetryFrames: TelemetryFrame[],
  currentTime: string | undefined,
) {
  if (!currentTime || telemetryFrames.length === 0) {
    return null;
  }

  const currentMs = Date.parse(currentTime);

  if (!Number.isFinite(currentMs)) {
    return null;
  }

  let low = 0;
  let high = telemetryFrames.length - 1;
  let matchIndex = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const frame = telemetryFrames[mid]!;

    if (frame.emittedAtMs <= currentMs) {
      matchIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return matchIndex >= 0 ? telemetryFrames[matchIndex]! : null;
}

function buildReplayBoot(
  boot: Awaited<ReturnType<typeof fetchSessionBoot>> | undefined,
  replayEvents: Array<{ emittedAt: string; topic: string; payload: unknown }>,
  currentEventTime: string | undefined,
) {
  if (!boot || !currentEventTime) return boot;
  const currentTime = Date.parse(currentEventTime);
  if (Number.isNaN(currentTime)) return boot;

  let latestTiming: unknown = undefined;
  let latestTimingApp: unknown = undefined;
  let latestTimingStats: unknown = undefined;
  let latestLapCount: unknown = undefined;
  let latestTrackStatus: unknown = undefined;
  let latestWeather: unknown = undefined;

  for (const event of replayEvents) {
    const eventTime = Date.parse(event.emittedAt);
    if (!Number.isNaN(eventTime) && eventTime > currentTime) break;
    if (event.topic === "timing") latestTiming = event.payload;
    else if (event.topic === "timingApp") latestTimingApp = event.payload;
    else if (event.topic === "timingStats") latestTimingStats = event.payload;
    else if (event.topic === "lapCount") latestLapCount = event.payload;
    else if (event.topic === "trackStatus") latestTrackStatus = event.payload;
    else if (event.topic === "weather") latestWeather = event.payload;
  }

  return {
    ...boot,
    state: {
      ...boot.state,
      ...(latestTiming !== undefined ? { TimingData: latestTiming } : {}),
      ...(latestTimingApp !== undefined
        ? { TimingAppData: latestTimingApp }
        : {}),
      ...(latestTimingStats !== undefined
        ? { TimingStats: latestTimingStats }
        : {}),
      ...(latestLapCount !== undefined ? { LapCount: latestLapCount } : {}),
      ...(latestTrackStatus !== undefined
        ? { TrackStatus: latestTrackStatus }
        : {}),
      ...(latestWeather !== undefined ? { WeatherData: latestWeather } : {}),
    },
  };
}

export function F1DashReplay({ sessionKey }: { sessionKey: number }) {
  const [playbackTimeMs, setPlaybackTimeMs] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  const [delayMs, setDelayMs] = useState(0);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);
  const [telemetryFrames, setTelemetryFrames] = useState<TelemetryFrame[]>([]);
  const [isTrackFullscreen, setIsTrackFullscreen] = useState(false);
  const trackPanelRef = useRef<HTMLDivElement | null>(null);
  const playbackTimeRef = useRef<number | null>(null);
  const playbackAnchorRef = useRef<{
    startedAt: number;
    baseTimeMs: number;
  } | null>(null);

  const bootQuery = useQuery({
    queryKey: ["f1dash", sessionKey, "boot"],
    queryFn: () => fetchSessionBoot(sessionKey),
    staleTime: 60_000,
  });
  const driversQuery = useQuery({
    queryKey: ["f1dash", sessionKey, "drivers"],
    queryFn: () => fetchSessionDrivers(sessionKey),
    staleTime: 30 * 60_000,
  });
  const outlineQuery = useQuery({
    queryKey: ["f1dash", sessionKey, "outline"],
    queryFn: () => fetchTrackOutline(sessionKey),
    staleTime: 30 * 60_000,
  });
  const raceControlQuery = useQuery({
    queryKey: ["f1dash", sessionKey, "race-control"],
    queryFn: () => fetchRaceControl(sessionKey, 25),
    staleTime: 60_000,
  });
  const metaQuery = useQuery({
    queryKey: ["f1dash", sessionKey, "meta"],
    queryFn: () => fetchSessionCatalogMeta(sessionKey),
    staleTime: 60_000,
  });
  const replayQuery = useInfiniteQuery({
    queryKey: ["f1dash", sessionKey, "replay"],
    queryFn: ({ pageParam }) =>
      fetchReplayChunks(sessionKey, pageParam, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (lastPage.data.length === 0) return undefined;
      return lastPage.data[lastPage.data.length - 1]!.chunkIndex + 1;
    },
    staleTime: 30 * 60_000,
  });

  const bootStartTime = useMemo(
    () => getSessionStartTime(bootQuery.data),
    [bootQuery.data],
  );
  const sessionStartTime =
    bootStartTime ?? metaQuery.data?.startsAt ?? undefined;
  const replayEndsAt = metaQuery.data?.lastFrameAt ?? undefined;
  const outlineDriverNumber = driversQuery.data?.data?.[0]?.driverNumber;

  const timelineQuery = useInfiniteQuery({
    queryKey: [
      "f1dash",
      sessionKey,
      "timeline",
      sessionStartTime ?? "unknown",
      replayEndsAt ?? "unknown",
    ],
    queryFn: ({ pageParam }) =>
      fetchTrackPositionFrames(sessionKey, {
        fromTime: pageParam,
        toTime: replayEndsAt,
        limit: 25_000,
      }),
    initialPageParam: sessionStartTime ?? "",
    getNextPageParam: (lastPage) => {
      const rows = lastPage.data;
      if (rows.length < 25_000) return undefined;
      return nextIsoTimestamp(rows[rows.length - 1]!.emittedAt);
    },
    enabled: Boolean(sessionStartTime),
    staleTime: 30 * 60_000,
  });

  const outlineFramesQuery = useQuery({
    queryKey: [
      "f1dash",
      sessionKey,
      "outline-frames",
      outlineDriverNumber ?? 0,
      sessionStartTime ?? "unknown",
    ],
    queryFn: () =>
      fetchTrackPositionFrames(sessionKey, {
        driverNumber: outlineDriverNumber,
        fromTime: sessionStartTime,
        toTime: replayEndsAt,
        limit: 8_000,
      }),
    enabled: Boolean(sessionStartTime) && outlineDriverNumber !== undefined,
    staleTime: 30 * 60_000,
  });

  const replayEvents = useMemo(
    () =>
      replayQuery.data?.pages
        .flatMap((page) => page.data)
        .flatMap((chunk) => chunk.events)
        .sort((a, b) => a.sequence - b.sequence) ?? [],
    [replayQuery.data?.pages],
  );
  const replayEventsByTime = useMemo(
    () =>
      [...replayEvents].sort((a, b) => {
        if (a.emittedAt === b.emittedAt) {
          return a.sequence - b.sequence;
        }

        return a.emittedAt.localeCompare(b.emittedAt);
      }),
    [replayEvents],
  );

  const timelineRows = useMemo(
    () => timelineQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [timelineQuery.data?.pages],
  );
  const groupedFrames = useMemo(() => {
    const grouped = new Map<
      string,
      Awaited<ReturnType<typeof fetchTrackPositionFrames>>["data"]
    >();
    for (const frame of timelineRows) {
      if (!hasCoordinates(frame)) continue;
      const current = grouped.get(frame.emittedAt) ?? [];
      current.push(frame);
      grouped.set(frame.emittedAt, current);
    }
    return grouped;
  }, [timelineRows]);

  const timelineEvents = useMemo(
    () =>
      [...groupedFrames.entries()]
        .filter(([, frames]) => frames.length >= 5)
        .map(([emittedAt], index) => ({ emittedAt, sequence: index + 1 })),
    [groupedFrames],
  );
  const timelineEventTimes = useMemo(
    () => timelineEvents.map((event) => Date.parse(event.emittedAt)),
    [timelineEvents],
  );
  const firstTimelineTimeMs = timelineEventTimes[0] ?? null;
  const lastTimelineTimeMs =
    timelineEventTimes[timelineEventTimes.length - 1] ?? null;
  const playbackCurrentMs = useMemo(() => {
    if (
      firstTimelineTimeMs == null ||
      lastTimelineTimeMs == null ||
      !Number.isFinite(firstTimelineTimeMs) ||
      !Number.isFinite(lastTimelineTimeMs)
    ) {
      return null;
    }

    if (playbackTimeMs == null || !Number.isFinite(playbackTimeMs)) {
      return firstTimelineTimeMs;
    }

    return Math.min(
      lastTimelineTimeMs,
      Math.max(firstTimelineTimeMs, playbackTimeMs),
    );
  }, [firstTimelineTimeMs, lastTimelineTimeMs, playbackTimeMs]);
  const currentIndex = useMemo(() => {
    if (playbackCurrentMs == null || timelineEventTimes.length === 0) {
      return 0;
    }

    return findTimelineIndexAtTime(timelineEventTimes, playbackCurrentMs);
  }, [playbackCurrentMs, timelineEventTimes]);
  const nextIndex = Math.min(currentIndex + 1, timelineEvents.length - 1);
  const currentEvent = timelineEvents[currentIndex] ?? null;
  const nextEvent = timelineEvents[nextIndex] ?? null;
  const playbackSpeed = PLAYBACK_SPEEDS[speedIndex] ?? 1;
  const currentFrames = currentEvent
    ? (groupedFrames.get(currentEvent.emittedAt) ?? [])
    : [];
  const nextFrames = nextEvent
    ? (groupedFrames.get(nextEvent.emittedAt) ?? [])
    : [];

  const currentModel = useMemo(
    () =>
      getTrackSurfaceModelFromFrames({
        boot: bootQuery.data,
        displayPositions: currentFrames,
        sessionDrivers: driversQuery.data?.data ?? [],
        outlinePoints: outlineQuery.data?.data ?? [],
        outlineFrames: outlineFramesQuery.data?.data ?? [],
      }),
    [
      bootQuery.data,
      currentFrames,
      driversQuery.data?.data,
      outlineFramesQuery.data?.data,
      outlineQuery.data?.data,
    ],
  );

  const nextModel = useMemo(
    () =>
      getTrackSurfaceModelFromFrames({
        boot: bootQuery.data,
        displayPositions: nextFrames,
        sessionDrivers: driversQuery.data?.data ?? [],
        outlinePoints: outlineQuery.data?.data ?? [],
        outlineFrames: outlineFramesQuery.data?.data ?? [],
      }),
    [
      bootQuery.data,
      driversQuery.data?.data,
      nextFrames,
      outlineFramesQuery.data?.data,
      outlineQuery.data?.data,
    ],
  );

  const frameProgress = useMemo(() => {
    if (
      playbackCurrentMs == null ||
      timelineEventTimes.length < 2 ||
      currentIndex >= timelineEventTimes.length - 1
    ) {
      return 0;
    }

    const currentTimeMs = timelineEventTimes[currentIndex];
    const nextTimeMs = timelineEventTimes[nextIndex];

    if (
      currentTimeMs == null ||
      nextTimeMs == null ||
      !Number.isFinite(currentTimeMs) ||
      !Number.isFinite(nextTimeMs) ||
      nextTimeMs <= currentTimeMs
    ) {
      return 0;
    }

    return clampUnit(
      (playbackCurrentMs - currentTimeMs) / (nextTimeMs - currentTimeMs),
    );
  }, [currentIndex, nextIndex, playbackCurrentMs, timelineEventTimes]);
  const interpolatedTime =
    playbackCurrentMs == null
      ? undefined
      : new Date(playbackCurrentMs).toISOString();

  const replayBoot = useMemo(
    () => buildReplayBoot(bootQuery.data, replayEventsByTime, interpolatedTime),
    [bootQuery.data, replayEventsByTime, interpolatedTime],
  );
  const currentTelemetryFrame = useMemo(
    () => findTelemetryFrameAtTime(telemetryFrames, interpolatedTime),
    [interpolatedTime, telemetryFrames],
  );

  const leaderboard = useMemo(() => getLeaderboard(replayBoot), [replayBoot]);
  const weather = useMemo(() => getWeather(replayBoot), [replayBoot]);

  const replayRows = useMemo<ReplayRow[]>(() => {
    if (!currentModel?.markers?.length) return leaderboard;
    const byNum = new Map(
      leaderboard.map((row) => [row.racingNumber, row] as const),
    );
    return currentModel.markers
      .map((marker) => {
        const existing = byNum.get(marker.racingNumber);
        const telemetry = currentTelemetryFrame?.byDriver.get(
          marker.racingNumber,
        );
        return {
          ...(existing ?? { racingNumber: marker.racingNumber, sectors: [] }),
          position: marker.position,
          name: marker.name,
          shortCode: marker.shortCode,
          teamName: marker.teamName,
          teamColor: marker.teamColor,
          headshotUrl: marker.headshotUrl ?? existing?.headshotUrl,
          currentCompound: marker.currentCompound ?? existing?.currentCompound,
          numberOfLaps: marker.numberOfLaps ?? existing?.numberOfLaps,
          replayLap: marker.numberOfLaps ?? existing?.numberOfLaps,
          progress: marker.progress,
          gapToLeader: existing?.gapToLeader,
          intervalToAhead: existing?.intervalToAhead,
          replayStatus: existing?.retired
            ? "Retired"
            : existing?.stopped
              ? "Stopped"
              : existing?.inPit
                ? "Pit"
                : "Running",
          liveSpeed: telemetry?.speed,
          liveGear: telemetry?.gear,
          liveRpm: telemetry?.rpm,
          liveThrottle: telemetry?.throttle,
          liveBrake: telemetry?.brake,
          liveDrs: telemetry?.drs,
          liveBattery: telemetry?.battery,
        };
      })
      .sort((a, b) => a.position - b.position);
  }, [currentModel?.markers, currentTelemetryFrame, leaderboard]);

  const loadedRatio = metaQuery.data?.frameCount
    ? Math.min(1, timelineRows.length / metaQuery.data.frameCount)
    : 0;
  const raceControlMessages = raceControlQuery.data?.data ?? [];
  const rcCount = raceControlMessages.length;
  const driverCount = replayRows.length;
  const replayLapProgress = useMemo(
    () => getLapProgress(replayBoot),
    [replayBoot],
  );
  const currentLap =
    replayLapProgress.currentLap ??
    currentModel?.currentLap ??
    replayRows[0]?.replayLap ??
    0;
  const totalLaps = replayLapProgress.totalLaps ?? currentModel?.totalLaps;

  const sessionInfo = bootQuery.data?.state?.SessionInfo as
    | Record<string, unknown>
    | undefined;
  const meeting = (sessionInfo?.Meeting ?? {}) as Record<string, unknown>;
  const meetingName =
    (meeting.Name as string) ?? metaQuery.data?.meetingName ?? "Session";
  const sessionName =
    metaQuery.data?.sessionName ?? (sessionInfo?.Name as string) ?? "";
  const countryName = (meeting.Country as Record<string, unknown>)?.Name as
    | string
    | undefined;
  const maxTimelineIndex = Math.max(timelineEvents.length - 1, 0);
  const seekToIndex = (nextIndexValue: number) => {
    const clampedIndex = Math.max(
      0,
      Math.min(maxTimelineIndex, nextIndexValue),
    );
    const nextTimeMs = timelineEventTimes[clampedIndex];

    if (nextTimeMs == null || !Number.isFinite(nextTimeMs)) {
      return;
    }

    playbackAnchorRef.current = null;
    playbackTimeRef.current = nextTimeMs;
    setPlaybackTimeMs(nextTimeMs);
  };
  const togglePlayback = () => {
    if (
      firstTimelineTimeMs == null ||
      lastTimelineTimeMs == null ||
      !Number.isFinite(firstTimelineTimeMs) ||
      !Number.isFinite(lastTimelineTimeMs)
    ) {
      return;
    }

    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    const clampedTime =
      playbackCurrentMs == null || !Number.isFinite(playbackCurrentMs)
        ? firstTimelineTimeMs
        : Math.min(
            lastTimelineTimeMs,
            Math.max(firstTimelineTimeMs, playbackCurrentMs),
          );
    const nextTimeMs =
      clampedTime >= lastTimelineTimeMs ? firstTimelineTimeMs : clampedTime;

    playbackAnchorRef.current = null;
    playbackTimeRef.current = nextTimeMs;
    setPlaybackTimeMs(nextTimeMs);
    setIsPlaying(true);
  };
  const jumpBackward = () => {
    seekToIndex(currentIndex - 40);
  };
  const jumpForward = () => {
    seekToIndex(currentIndex + 40);
  };

  useEffect(() => {
    playbackTimeRef.current = playbackCurrentMs;
  }, [playbackCurrentMs]);

  // Playback loop
  useEffect(() => {
    if (
      !isPlaying ||
      timelineEvents.length <= 1 ||
      firstTimelineTimeMs == null ||
      lastTimelineTimeMs == null ||
      !Number.isFinite(firstTimelineTimeMs) ||
      !Number.isFinite(lastTimelineTimeMs)
    ) {
      return;
    }

    let frameId = 0;

    const animate = (now: number) => {
      const anchor = playbackAnchorRef.current;

      if (!anchor) {
        playbackAnchorRef.current = {
          startedAt: now,
          baseTimeMs:
            playbackTimeRef.current == null ||
            !Number.isFinite(playbackTimeRef.current)
              ? firstTimelineTimeMs
              : playbackTimeRef.current,
        };
        frameId = window.requestAnimationFrame(animate);
        return;
      }

      const nextTimeMs = Math.min(
        lastTimelineTimeMs,
        anchor.baseTimeMs + (now - anchor.startedAt) * playbackSpeed,
      );

      setPlaybackTimeMs(nextTimeMs);

      if (nextTimeMs >= lastTimelineTimeMs) {
        playbackAnchorRef.current = null;
        setIsPlaying(false);
        return;
      }

      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);

    return () => {
      playbackAnchorRef.current = null;
      window.cancelAnimationFrame(frameId);
    };
  }, [
    firstTimelineTimeMs,
    isPlaying,
    lastTimelineTimeMs,
    playbackSpeed,
    timelineEvents.length,
  ]);

  // Prefetch timeline
  useEffect(() => {
    if (
      timelineQuery.hasNextPage &&
      !timelineQuery.isFetchingNextPage &&
      ((timelineQuery.data?.pages.length ?? 0) < 4 ||
        currentIndex >= timelineEvents.length - 48)
    ) {
      void timelineQuery.fetchNextPage();
    }
  }, [
    currentIndex,
    timelineEvents.length,
    timelineQuery.data?.pages.length,
    timelineQuery.fetchNextPage,
    timelineQuery.hasNextPage,
    timelineQuery.isFetchingNextPage,
  ]);

  // Prefetch replay chunks
  useEffect(() => {
    if (replayQuery.hasNextPage && !replayQuery.isFetchingNextPage) {
      void replayQuery.fetchNextPage();
    }
  }, [
    replayQuery.fetchNextPage,
    replayQuery.hasNextPage,
    replayQuery.isFetchingNextPage,
  ]);

  useEffect(() => {
    let cancelled = false;

    const decodeTelemetry = async () => {
      const nextTelemetryFrames = (
        await Promise.all(
          replayEventsByTime
            .filter((event) => event.topic === "telemetry")
            .map((event) => parseTelemetryPayload(event.payload)),
        )
      )
        .flat()
        .sort((a, b) => a.emittedAtMs - b.emittedAtMs);

      if (!cancelled) {
        setTelemetryFrames(nextTelemetryFrames);
      }
    };

    void decodeTelemetry();

    return () => {
      cancelled = true;
    };
  }, [replayEventsByTime]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      switch (event.key) {
        case " ":
          event.preventDefault();
          if (isPlaying) {
            setIsPlaying(false);
            break;
          }

          playbackAnchorRef.current = null;
          if (
            firstTimelineTimeMs == null ||
            lastTimelineTimeMs == null ||
            !Number.isFinite(firstTimelineTimeMs) ||
            !Number.isFinite(lastTimelineTimeMs)
          ) {
            break;
          }

          {
            const clampedTime =
              playbackCurrentMs == null || !Number.isFinite(playbackCurrentMs)
                ? firstTimelineTimeMs
                : Math.min(
                    lastTimelineTimeMs,
                    Math.max(firstTimelineTimeMs, playbackCurrentMs),
                  );
            const nextTimeMs =
              clampedTime >= lastTimelineTimeMs
                ? firstTimelineTimeMs
                : clampedTime;

            playbackTimeRef.current = nextTimeMs;
            setPlaybackTimeMs(nextTimeMs);
          }
          setIsPlaying(true);
          break;
        case "ArrowRight":
          event.preventDefault();
          seekToIndex(currentIndex + (event.shiftKey ? 120 : 20));
          break;
        case "ArrowLeft":
          event.preventDefault();
          seekToIndex(currentIndex - (event.shiftKey ? 120 : 20));
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentIndex,
    firstTimelineTimeMs,
    isPlaying,
    lastTimelineTimeMs,
    playbackCurrentMs,
  ]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsTrackFullscreen(
        document.fullscreenElement === trackPanelRef.current,
      );
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const isLoading =
    bootQuery.isLoading ||
    driversQuery.isLoading ||
    outlineQuery.isLoading ||
    timelineQuery.isLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--workspace-bg)] text-[var(--foreground)]">
        <Skeleton className="m-4 h-[calc(100vh-40px)] border border-[var(--border)] bg-white/10" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--workspace-bg)] text-[var(--foreground)]">
      {/* Transport Bar */}
      <div className="shrink-0 border-b border-[var(--workspace-border)] bg-[var(--workspace-surface)]">
        {/* Controls row */}
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3 text-sm text-[color-mix(in_oklab,var(--foreground),transparent_28%)]">
            <span className="font-medium text-[var(--foreground)]">
              {sessionName}
            </span>
            <span className="text-[color-mix(in_oklab,var(--foreground),transparent_60%)]">
              •
            </span>
            <span>{countryName ?? meetingName}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={jumpBackward}
              className="px-1.5 py-1 text-xs text-[var(--workspace-muted)] hover:bg-[var(--workspace-subtle)] hover:text-[var(--foreground)]"
            >
              <SkipBack className="size-3.5" />
            </button>
            <button
              onClick={togglePlayback}
              className={`px-3 py-1.5 text-sm font-bold ${isPlaying ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--workspace-subtle)] text-[var(--foreground)] hover:bg-[var(--muted)]"}`}
            >
              {isPlaying ? (
                <Pause className="inline size-3.5" />
              ) : (
                <Play className="ml-0.5 inline size-3.5" />
              )}
            </button>
            <button
              onClick={jumpForward}
              className="px-1.5 py-1 text-xs text-[var(--workspace-muted)] hover:bg-[var(--workspace-subtle)] hover:text-[var(--foreground)]"
            >
              <SkipForward className="size-3.5" />
            </button>
            {PLAYBACK_SPEEDS.map((speed, i) => (
              <button
                key={speed}
                onClick={() => setSpeedIndex(i)}
                className={`px-2 py-1.5 text-xs font-bold transition-colors ${speedIndex === i ? "bg-[var(--foreground)] text-[var(--workspace-bg)]" : "text-[var(--workspace-muted)] hover:text-[var(--foreground)]"}`}
              >
                <NumberFlow value={speed} suffix="x" />
              </button>
            ))}
            <div className="ml-3 border-l border-[var(--workspace-border)] pl-3 font-mono text-sm">
              <span className="text-[var(--workspace-muted)]">Elapsed: </span>
              <span className="font-bold text-[var(--foreground)]">
                {formatElapsed(
                  sessionStartTime,
                  interpolatedTime ?? currentEvent?.emittedAt,
                )}
              </span>
            </div>
            <div className="ml-2 font-mono text-sm text-[var(--workspace-muted)]">
              {formatClock(interpolatedTime ?? currentEvent?.emittedAt)}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-[var(--workspace-muted)]">
            <span><NumberFlow value={driverCount} /> drivers</span>
            <span><NumberFlow value={rcCount} /> RC msgs</span>
          </div>
        </div>

        {/* Scrubber / Slider */}
        <div className="px-4 pb-2">
          <input
            type="range"
            min={0}
            max={maxTimelineIndex}
            value={Math.min(currentIndex, maxTimelineIndex)}
            onChange={(e) => seekToIndex(Number(e.target.value))}
            className="block h-2 w-full cursor-pointer accent-red-600"
            disabled={timelineEvents.length === 0}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex min-h-0 flex-1">
        {/* Left: Track Canvas (clone-style, fills full space) */}
        <div
          ref={trackPanelRef}
          className="flex min-w-0 flex-1 flex-col bg-[var(--workspace-bg)]"
        >
          <div className="relative min-h-0 flex-1 overflow-hidden p-4">
            {/* 2D/3D Toggle */}
            <div className="absolute left-7 top-7 z-10 flex items-center gap-2">
              <button
                onClick={() => setViewMode((v) => (v === "2d" ? "3d" : "2d"))}
                className="flex items-center gap-1.5 border-[var(--border)] border border-[var(--workspace-border)] bg-[var(--workspace-overlay)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] bg-[var(--panel)] hover:bg-[var(--workspace-surface)]"
              >
                <Layers3 className="size-3.5" />
                {viewMode.toUpperCase()}
              </button>
              <Link
                href="/simulate"
                className="flex items-center gap-1.5 border-[var(--border)] border border-[var(--workspace-border)] bg-[var(--workspace-overlay)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] bg-[var(--panel)] hover:bg-[var(--workspace-surface)]"
              >
                <ArrowLeft className="size-3.5" />
                Exit
              </Link>
              <button
                onClick={async () => {
                  if (!trackPanelRef.current) return;
                  if (document.fullscreenElement === trackPanelRef.current) {
                    await document.exitFullscreen();
                    return;
                  }
                  await trackPanelRef.current.requestFullscreen();
                }}
                className="flex items-center gap-1.5 border-[var(--border)] border border-[var(--workspace-border)] bg-[var(--workspace-overlay)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] bg-[var(--panel)] hover:bg-[var(--workspace-surface)]"
              >
                {isTrackFullscreen ? (
                  <Minimize2 className="size-3.5" />
                ) : (
                  <Maximize2 className="size-3.5" />
                )}
                {isTrackFullscreen ? "Collapse" : "Fullscreen"}
              </button>
            </div>

            {viewMode === "3d" ? (
              <div className="h-full overflow-hidden border border-[var(--border)] border border-[var(--workspace-border)]">
                <TrackCanvas3D
                  model={currentModel}
                  nextModel={nextModel}
                  interpolation={frameProgress}
                  selectedDriver={selectedDriver}
                  onSelectDriver={setSelectedDriver}
                />
              </div>
            ) : (
              <ReplayTrackCanvas
                model={currentModel}
                nextModel={nextModel}
                interpolation={frameProgress}
                isLoading={false}
                viewMode="2d"
                chrome={false}
                title={
                  metaQuery.data?.meetingName ??
                  currentModel?.title ??
                  meetingName
                }
                subtitle={
                  metaQuery.data?.sessionName ??
                  currentModel?.subtitle ??
                  sessionName
                }
                badgeLabel="Replay"
                selectedDriver={selectedDriver}
                onSelectDriver={setSelectedDriver}
                interactive
              />
            )}

            {/* Weather Overlay */}
            {weather ? (
              <div className="absolute right-7 top-7 z-10 border-[var(--border)] border border-[var(--workspace-border)] bg-[var(--workspace-overlay)] px-3 py-2 text-xs bg-[var(--panel)]">
                <div className="mb-1 text-[9px] uppercase tracking-wider text-[var(--workspace-muted)]">
                  Weather
                </div>
                <div className="space-y-1 text-[var(--foreground)]">
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--workspace-muted)]">Air</span>
                    <span>{weather.airTemp != null ? <NumberFlow value={Number(weather.airTemp)} suffix="°C" /> : "--"}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--workspace-muted)]">Track</span>
                    <span>{weather.trackTemp != null ? <NumberFlow value={Number(weather.trackTemp)} suffix="°C" /> : "--"}</span>
                  </div>
                </div>
              </div>
            ) : null}

            {isTrackFullscreen ? (
              <div className="absolute inset-x-6 bottom-6 z-20 border border-[var(--border)] border border-[var(--workspace-border)] bg-[var(--workspace-overlay)] p-3 bg-[var(--panel)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={jumpBackward}
                      className="border-[var(--border)] border border-[var(--workspace-border)] bg-[var(--workspace-subtle)] px-2 py-2 text-[var(--workspace-muted)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                    >
                      <SkipBack className="size-4" />
                    </button>
                    <button
                      onClick={togglePlayback}
                      className={`border-[var(--border)] px-3 py-2 text-sm font-bold transition-colors ${isPlaying ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--foreground)] text-[var(--workspace-bg)] hover:opacity-90"}`}
                    >
                      {isPlaying ? (
                        <Pause className="size-4" />
                      ) : (
                        <Play className="ml-0.5 size-4" />
                      )}
                    </button>
                    <button
                      onClick={jumpForward}
                      className="border-[var(--border)] border border-[var(--workspace-border)] bg-[var(--workspace-subtle)] px-2 py-2 text-[var(--workspace-muted)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                    >
                      <SkipForward className="size-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1 border-[var(--border)] border border-[var(--workspace-border)] bg-[var(--workspace-subtle)] p-1">
                    {PLAYBACK_SPEEDS.map((speed, index) => (
                      <button
                        key={speed}
                        onClick={() => setSpeedIndex(index)}
                        className={`px-2 py-1 text-[11px] font-bold transition-colors ${speedIndex === index ? "bg-[var(--foreground)] text-[var(--workspace-bg)]" : "text-[var(--workspace-muted)] hover:text-[var(--foreground)]"}`}
                      >
                        <NumberFlow value={speed} suffix="x" />
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-4 font-mono text-xs text-[color-mix(in_oklab,var(--foreground),transparent_20%)]">
                    <span>
                      <span className="text-[var(--workspace-muted)]">
                        Elapsed{" "}
                      </span>
                      {formatElapsed(
                        sessionStartTime,
                        interpolatedTime ?? currentEvent?.emittedAt,
                      )}
                    </span>
                    <span>
                      {formatClock(interpolatedTime ?? currentEvent?.emittedAt)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={maxTimelineIndex}
                    value={Math.min(currentIndex, maxTimelineIndex)}
                    onChange={(event) =>
                      seekToIndex(Number(event.target.value))
                    }
                    className="block h-2 w-full cursor-pointer accent-red-600"
                    disabled={timelineEvents.length === 0}
                  />
                  <div className="min-w-[72px] text-right font-mono text-xs text-[var(--workspace-muted)]">
                    {currentIndex + 1} / {timelineEvents.length}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Race Control Overlay */}
            {raceControlMessages.length > 0 ? (
              <div className="absolute bottom-24 right-7 z-10 flex max-w-[320px] flex-col gap-2">
                {raceControlMessages.slice(0, 3).map((msg) => (
                  <div
                    key={`overlay-${msg.sequence}`}
                    className="rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-overlay)] px-3 py-2 text-xs bg-[var(--panel)]"
                  >
                    <div className="text-[9px] uppercase tracking-wider text-[var(--workspace-muted)]">
                      {msg.flag ?? msg.category}
                    </div>
                    <div className="mt-1 leading-tight text-[var(--foreground)]">
                      {msg.body}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Sector Legend */}
            <div className="absolute bottom-7 left-7 z-10 flex items-center gap-3 border-[var(--border)] border border-[var(--workspace-border)] bg-[var(--workspace-overlay)] px-3 py-1.5 text-[10px] bg-[var(--panel)]">
              <span className="flex items-center gap-1">
                <span className="h-0.5 w-4 bg-red-500" /> S1
              </span>
              <span className="flex items-center gap-1">
                <span className="h-0.5 w-4 bg-cyan-400" /> S2
              </span>
              <span className="flex items-center gap-1">
                <span className="h-0.5 w-4 bg-yellow-400" /> S3
              </span>
            </div>
          </div>
        </div>

        {/* Right: Timing Tower */}
        <div className="flex w-[480px] shrink-0 flex-col border-l border-[var(--workspace-border)] bg-[var(--workspace-surface)] xl:w-[540px]">
          {/* Timing Header */}
          <div className="flex items-center justify-between border-b border-[var(--workspace-border)] px-4 py-3">
            <div className="flex items-center gap-3">
              {/* Delay Control */}
              <div className="flex items-center gap-1 border-[var(--border)] border border-[var(--workspace-border)] bg-[var(--workspace-subtle)] px-2 py-1">
                <Clock className="size-3.5 text-[var(--workspace-muted)]" />
                <span className="text-xs text-[var(--workspace-muted)]">
                  DELAY
                </span>
                <button
                  onClick={() => setDelayMs((v) => Math.max(0, v - 100))}
                  className="px-1 text-[var(--workspace-muted)] hover:text-[var(--foreground)]"
                >
                  <Minus className="size-3" />
                </button>
                <span className="min-w-[36px] text-center font-mono text-xs font-bold">
                  {delayMs}ms
                </span>
                <button
                  onClick={() => setDelayMs((v) => v + 100)}
                  className="px-1 text-[var(--workspace-muted)] hover:text-[var(--foreground)]"
                >
                  <Plus className="size-3" />
                </button>
              </div>
            </div>

            {/* Race Progress */}
            {totalLaps ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--workspace-muted)]">
                  RACE PROGRESS
                </span>
                <div>
                  <span className="text-lg font-bold text-red-500">
                    <NumberFlow value={currentLap} />
                  </span>
                  <span className="text-[var(--workspace-muted)]">
                    {" "}
                    / <NumberFlow value={totalLaps} />
                  </span>
                </div>
                <div className="h-1 w-16 overflow-hidden bg-white/10">
                  <div
                    className="h-full bg-red-600 transition-all"
                    style={{
                      width: `${totalLaps > 0 ? (currentLap / totalLaps) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* Live Timing Header */}
          <div className="border-b border-[var(--workspace-border)] px-4 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-red-500" />
                <span className="text-sm font-bold uppercase tracking-wider">
                  Live Timing
                </span>
              </div>
              <span className="bg-[var(--workspace-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--workspace-muted)]">
                <NumberFlow value={driverCount} /> drivers
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-[10px] text-[var(--workspace-muted)]">
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-purple-400" /> Fastest
              </span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-400" />{" "}
                Personal
              </span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-yellow-400" /> Slower
              </span>
            </div>
          </div>

          {/* Column Headers */}
          <div className="grid grid-cols-[40px_1fr_60px_60px_100px_44px_40px] items-center gap-px border-b border-[var(--workspace-border)] bg-[var(--workspace-subtle)] px-2 py-2 text-[10px] font-medium uppercase tracking-wider text-[var(--workspace-muted)]">
            <div className="text-center">POS</div>
            <div />
            <div className="text-right">GAP</div>
            <div className="text-right">INT</div>
            <div className="text-center">SECTORS</div>
            <div className="text-center">DRS</div>
            <div className="text-center">LAP</div>
          </div>

          {/* Driver Rows */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {replayRows.map((row) => {
              const isExpanded = expandedDriver === row.racingNumber;
              const isSelected = selectedDriver === row.racingNumber;
              const isPit = row.replayStatus === "Pit" || row.inPit;
              const isRetired = row.replayStatus === "Retired" || row.retired;
              const knownPosition = hasKnownPosition(row.position);

              return (
                <div key={row.racingNumber}>
                  <div
                    onClick={() => {
                      setExpandedDriver(isExpanded ? null : row.racingNumber);
                      setSelectedDriver(isSelected ? null : row.racingNumber);
                    }}
                    className={`grid cursor-pointer grid-cols-[40px_1fr_60px_60px_100px_44px_40px] items-center gap-px border-b border-[var(--workspace-border)] px-2 py-2 transition-colors ${isSelected ? "bg-[var(--workspace-subtle)]" : "hover:bg-[color-mix(in_oklab,var(--foreground),transparent_94%)]"} ${isRetired ? "opacity-40" : ""}`}
                  >
                    {/* Position */}
                    <div className="flex justify-center">
                      <span
                        className={`flex size-7 items-center justify-center text-xs font-bold ${knownPosition && row.position <= 3 ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--workspace-subtle)] text-[var(--foreground)]"}`}
                      >
                        {knownPosition ? <NumberFlow value={row.position} /> : "TBD"}
                      </span>
                    </div>

                    {/* Driver Info */}
                    <div className="flex items-center gap-2 px-1">
                      {row.headshotUrl ? (
                        <img
                          src={row.headshotUrl}
                          alt={row.shortCode ?? row.racingNumber}
                          className="size-8 shrink-0 rounded-full border-2 object-cover object-top"
                          style={{
                            borderColor: getSoftTeamColor(row.teamColor),
                          }}
                        />
                      ) : (
                        <div
                          className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold"
                          style={{
                            borderColor: getSoftTeamColor(row.teamColor),
                          }}
                        >
                          {row.shortCode ?? row.racingNumber}
                        </div>
                      )}
                      <div
                        className="h-8 w-1 shrink-0 rounded-full"
                        style={{
                          backgroundColor: getSoftTeamColor(row.teamColor),
                        }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold">
                            {row.shortCode ?? row.racingNumber}
                          </span>
                          <span className="text-[10px] text-[var(--workspace-muted)]">
                            #{row.racingNumber}
                          </span>
                          {isPit && (
                            <span className="bg-yellow-500/20 px-1 py-0.5 text-[9px] font-bold text-yellow-400">
                              PIT
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[10px] text-[var(--workspace-muted)]">
                          {row.name}
                        </div>
                      </div>
                    </div>

                    {/* GAP */}
                    <div className="text-right font-mono text-xs text-[color-mix(in_oklab,var(--foreground),transparent_28%)]">
                      {row.position === 1 ? (
                        <span className="font-bold text-red-400">P1</span>
                      ) : !knownPosition ? (
                        "TBD"
                      ) : (
                        (row.gapToLeader ?? "--")
                      )}
                    </div>

                    {/* Interval */}
                    <div className="text-right font-mono text-xs text-[var(--workspace-muted)]">
                      {!knownPosition
                        ? "TBD"
                        : row.position === 1
                          ? "INT"
                          : (row.intervalToAhead ?? "--")}
                    </div>

                    {/* Sectors */}
                    <div className="flex items-center justify-center gap-1">
                      {row.sectors && row.sectors.length > 0 ? (
                        row.sectors.slice(0, 3).map((sector, i) => (
                          <span
                            key={i}
                            className={`font-mono text-[10px] ${sectorColor(sector)}`}
                          >
                            {sector.value ?? "--"}
                          </span>
                        ))
                      ) : (
                        <>
                          <span className="font-mono text-[10px] text-[color-mix(in_oklab,var(--foreground),transparent_72%)]">
                            --
                          </span>
                          <span className="font-mono text-[10px] text-[color-mix(in_oklab,var(--foreground),transparent_72%)]">
                            --
                          </span>
                          <span className="font-mono text-[10px] text-[color-mix(in_oklab,var(--foreground),transparent_72%)]">
                            --
                          </span>
                        </>
                      )}
                    </div>

                    {/* DRS */}
                    <div className="flex justify-center">
                      <span className="size-4 rounded-full bg-green-500/20 text-center text-[9px] font-bold leading-4 text-green-400">
                        {row.position <= 20 ? "0" : ""}
                      </span>
                    </div>

                    {/* LAP */}
                    <div className="text-center font-mono text-xs text-[var(--workspace-muted)]">
                      {(row.replayLap ?? row.numberOfLaps) != null ? <NumberFlow value={row.replayLap ?? row.numberOfLaps!} /> : "--"}
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="grid grid-cols-6 gap-px border-b border-[var(--workspace-border)] bg-[var(--workspace-subtle)]">
                      <div className="p-3">
                        <div className="text-[9px] uppercase tracking-wider text-[var(--workspace-muted)]">
                          SPEED
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                          <span className="text-green-400 text-xs font-bold">
                            <NumberFlow value={row.liveSpeed ?? row.speedTrap ?? 0} />
                          </span>
                          <span className="text-[10px] text-[var(--workspace-muted)]">
                            km/h
                          </span>
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="text-[9px] uppercase tracking-wider text-[var(--workspace-muted)]">
                          GEAR
                        </div>
                        <div className="mt-1 text-lg font-bold">
                          {row.liveGear != null ? <NumberFlow value={row.liveGear} /> : "-"}
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="text-[9px] uppercase tracking-wider text-[var(--workspace-muted)]">
                          RPM
                        </div>
                        <div className="mt-1 text-red-400 font-bold">
                          {row.liveRpm != null ? <NumberFlow value={row.liveRpm} /> : "-"}
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="text-[9px] uppercase tracking-wider text-[var(--workspace-muted)]">
                          DRS / BAT
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <span className="font-bold text-cyan-300">
                            {row.liveDrs != null ? <NumberFlow value={row.liveDrs} /> : "-"}
                          </span>
                          <span className="text-[var(--workspace-muted)]">
                            /
                          </span>
                          <span className="font-bold text-amber-300">
                            {row.liveBattery == null
                              ? "--"
                              : <NumberFlow value={row.liveBattery} suffix="%" />}
                          </span>
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="text-[9px] uppercase tracking-wider text-[var(--workspace-muted)]">
                          BEST LAP
                        </div>
                        <div className="mt-1 font-mono text-xs">
                          {row.bestLapTime ?? "--"}
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="text-[9px] uppercase tracking-wider text-[var(--workspace-muted)]">
                          THROTTLE / BRAKE
                        </div>
                        <div className="mt-2 flex gap-1">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--workspace-subtle)]">
                            <div
                              className="h-full bg-green-500"
                              style={{ width: `${row.liveThrottle ?? 0}%` }}
                            />
                          </div>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--workspace-subtle)]">
                            <div
                              className="h-full bg-red-500"
                              style={{ width: `${row.liveBrake ?? 0}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      {/* Sector summary */}
                      <div className="col-span-5 flex items-center gap-4 border-t border-[var(--workspace-border)] px-3 py-2 text-xs">
                        {["S1", "S2", "S3"].map((label, i) => {
                          const sector = row.sectors?.[i];
                          return (
                            <div
                              key={label}
                              className="flex items-center gap-1.5"
                            >
                              <span className="text-[var(--workspace-muted)]">
                                {label}
                              </span>
                              <span
                                className={`font-mono ${sector ? sectorColor(sector) : "text-white/20"}`}
                              >
                                {sector?.value ?? "--"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
