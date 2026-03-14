"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Copy,
  HelpCircle,
  Menu,
  Pause,
  Play,
  Search,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import type { LiveEnvelope, RaceControlMessage, SessionBoot, SessionCatalogRow, SessionDriver, TrackOutlinePoint } from "@f1-hub/contracts";

import {
  fetchRaceControl,
  fetchReplayChunks,
  fetchSessionBoot,
  fetchSessionCatalog,
  fetchSessionCatalogMeta,
  fetchSessionDrivers,
  fetchSessionSummary,
  fetchTrackOutline,
  fetchTrackReplayFrame,
} from "@/lib/api";
import { getLeaderboard, getTrackSurfaceModelFromFrames, type TrackSurfaceModel } from "@/lib/session-insights";
import { cn } from "@/lib/utils";
import { ReplayTrackCanvas } from "@/components/replay-track-canvas";

const NAV_ITEMS = [
  { href: "/", label: "Home", description: "Welcome to F1Dash" },
  { href: "/dashboard", label: "Dashboard", description: "Live timing & telemetry" },
  { href: "/replica", label: "Simulate", description: "Replay sessions" },
  { href: "/telemetry", label: "Telemetry", description: "Deep dive analysis" },
  { href: "/schedule", label: "Schedule", description: "Race calendar" },
  { href: "/weather", label: "Weather", description: "Race weekend forecast" },
  { href: "/drivers", label: "Drivers", description: "Driver profiles" },
  { href: "/constructors", label: "Constructors", description: "Team standings" },
  { href: "/standings", label: "Standings", description: "Championships" },
  { href: "/records", label: "Records", description: "All-time records" },
  { href: "/map", label: "Map", description: "Track overview" },
  { href: "/news", label: "News", description: "Latest updates" },
  { href: "/archive", label: "Archive", description: "Historical data" },
  { href: "/learn", label: "Learn", description: "F1" },
  { href: "/faq", label: "FAQ", description: "" },
  { href: "/about", label: "About", description: "" },
  { href: "/plus", label: "F1Dash+", description: "" },
] as const;

const SOCIALS = [
  { href: "https://x.com/F1Dash", label: "Follow us on X (Twitter)", short: "X" },
  { href: "https://www.facebook.com/f1dash", label: "Follow us on Facebook", short: "f" },
  { href: "https://www.youtube.com/@f1dash_net", label: "Subscribe on YouTube", short: "YT" },
  { href: "https://www.instagram.com/f1dash_net/", label: "Follow us on Instagram", short: "IG" },
] as const;

const SPEEDS = [1, 2, 5, 10] as const;
const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

type FilterType = "all" | "race" | "qualifying" | "practice" | "sprint";

type TeamRadioEntry = {
  id: string;
  emittedAt: string;
  driverNumber?: string;
  label: string;
  transcript: string;
};

function formatClock(value: number) {
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatWallClock(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatCardDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function classForSessionType(value: string) {
  const type = value.toLowerCase();
  if (type.includes("race")) return "bg-[#113327] text-[#5cf1a8]";
  if (type.includes("qualifying")) return "bg-[#3d2a10] text-[#ffd56b]";
  if (type.includes("sprint")) return "bg-[#23193f] text-[#b895ff]";
  return "bg-[#142d42] text-[#75c8ff]";
}

function inferLocation(meetingName: string) {
  const locations: Array<{ match: string; city: string; country: string; flag: string }> = [
    { match: "Australia", city: "Melbourne", country: "Australia", flag: "AUS" },
    { match: "China", city: "Shanghai", country: "China", flag: "CHN" },
    { match: "Bahrain", city: "Sakhir", country: "Bahrain", flag: "BHR" },
    { match: "Saudi", city: "Jeddah", country: "Saudi Arabia", flag: "KSA" },
    { match: "Japan", city: "Suzuka", country: "Japan", flag: "JPN" },
    { match: "Miami", city: "Miami", country: "United States", flag: "USA" },
    { match: "Monaco", city: "Monte Carlo", country: "Monaco", flag: "MCO" },
    { match: "Canada", city: "Montreal", country: "Canada", flag: "CAN" },
    { match: "Great Britain", city: "Silverstone", country: "Great Britain", flag: "GBR" },
    { match: "Belgian", city: "Spa", country: "Belgium", flag: "BEL" },
    { match: "Dutch", city: "Zandvoort", country: "Netherlands", flag: "NLD" },
    { match: "Italian", city: "Monza", country: "Italy", flag: "ITA" },
    { match: "Singapore", city: "Singapore", country: "Singapore", flag: "SGP" },
    { match: "United States", city: "Austin", country: "United States", flag: "USA" },
    { match: "Mexico", city: "Mexico City", country: "Mexico", flag: "MEX" },
    { match: "Brazil", city: "Sao Paulo", country: "Brazil", flag: "BRA" },
    { match: "Las Vegas", city: "Las Vegas", country: "United States", flag: "USA" },
    { match: "Qatar", city: "Lusail", country: "Qatar", flag: "QAT" },
    { match: "Abu Dhabi", city: "Yas Marina", country: "United Arab Emirates", flag: "UAE" },
  ];

  return locations.find((location) => meetingName.includes(location.match)) ?? {
    city: "Circuit",
    country: "Unknown",
    flag: "F1",
  };
}

function getInitialSession(rows: SessionCatalogRow[]) {
  return rows.find((row) => row.replayReady && row.hasFrames) ?? rows[0] ?? null;
}

function lowerIncludes(value: string, needle: string) {
  return value.toLowerCase().includes(needle.toLowerCase());
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function getNestedString(record: Record<string, unknown> | null, key: string) {
  return asString(record?.[key]);
}

function extractWeather(boot: SessionBoot | undefined) {
  const weather = asRecord(boot?.state.WeatherData);
  return {
    air: getNestedString(weather, "AirTemp") ?? "--",
    track: getNestedString(weather, "TrackTemp") ?? "--",
    humidity: getNestedString(weather, "Humidity") ?? "--",
    wind: getNestedString(weather, "WindSpeed") ?? "--",
    rain: getNestedString(weather, "Rainfall") ?? "No",
  };
}

function extractTrackStatus(boot: SessionBoot | undefined) {
  const trackStatus = asRecord(boot?.state.TrackStatus);
  const status = getNestedString(trackStatus, "Status") ?? "1";
  const message = getNestedString(trackStatus, "Message") ?? "GREEN";

  if (status === "1") {
    return { label: "GREEN", tone: "text-[#8cf57f]", pill: "bg-[#16391d] text-[#8cf57f]" };
  }
  if (status === "2") {
    return { label: message || "YELLOW", tone: "text-[#ffd56b]", pill: "bg-[#3a2b0f] text-[#ffd56b]" };
  }
  if (status === "4") {
    return { label: "SAFETY CAR", tone: "text-[#75c8ff]", pill: "bg-[#15263a] text-[#75c8ff]" };
  }
  return { label: message, tone: "text-white", pill: "bg-white/10 text-white" };
}

function applyReplayBoot(boot: SessionBoot | undefined, events: LiveEnvelope[], endIndex: number) {
  if (!boot) {
    return undefined;
  }

  const nextState: Record<string, unknown> = { ...boot.state };

  for (let index = 0; index <= endIndex; index += 1) {
    const event = events[index];
    if (!event) continue;

    switch (event.topic) {
      case "timing":
        nextState.TimingData = event.payload;
        break;
      case "timingApp":
        nextState.TimingAppData = event.payload;
        break;
      case "timingStats":
        nextState.TimingStats = event.payload;
        break;
      case "lapCount":
        nextState.LapCount = event.payload;
        break;
      case "trackStatus":
        nextState.TrackStatus = event.payload;
        break;
      case "weather":
        nextState.WeatherData = event.payload;
        break;
      case "driverList":
        nextState.DriverList = event.payload;
        break;
      case "championshipPrediction":
        nextState.ChampionshipPrediction = event.payload;
        break;
      default:
        break;
    }
  }

  return {
    ...boot,
    state: nextState,
  } satisfies SessionBoot;
}

function binarySearchEventIndex(events: LiveEnvelope[], timeMs: number) {
  if (events.length === 0) return -1;
  let low = 0;
  let high = events.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const middleEvent = events[middle];
    if (!middleEvent) break;
    const middleTime = Date.parse(middleEvent.emittedAt);

    if (middleTime <= timeMs) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return Math.max(0, high);
}

function recursiveCollectObjects(value: unknown, output: Record<string, unknown>[]) {
  if (Array.isArray(value)) {
    for (const item of value) recursiveCollectObjects(item, output);
    return;
  }

  const record = asRecord(value);
  if (!record) return;
  output.push(record);
  for (const nested of Object.values(record)) recursiveCollectObjects(nested, output);
}

function extractTeamRadioEntries(events: LiveEnvelope[], endIndex: number, drivers: SessionDriver[]) {
  const driverMap = new Map(drivers.map((driver) => [String(driver.driverNumber), driver] as const));
  const entries = new Map<string, TeamRadioEntry>();

  for (let index = 0; index <= endIndex; index += 1) {
    const event = events[index];
    if (!event || event.topic !== "teamRadio") continue;

    const records: Record<string, unknown>[] = [];
    recursiveCollectObjects(event.payload, records);

    for (const record of records) {
      const driverNumber =
        asString(record.RacingNumber) ??
        asString(record.racingNumber) ??
        asString(record.DriverNumber) ??
        asString(record.driverNumber);

      const utc =
        asString(record.Utc) ??
        asString(record.utc) ??
        asString(record.Timestamp) ??
        asString(record.timestamp) ??
        event.emittedAt;

      const transcript =
        asString(record.Transcript) ??
        asString(record.transcript) ??
        asString(record.Message) ??
        asString(record.message) ??
        asString(record.Body) ??
        asString(record.body) ??
        "No transcription available";

      if (!driverNumber && transcript === "No transcription available") {
        continue;
      }

      const driver = driverNumber ? driverMap.get(driverNumber) : undefined;
      const label = driver
        ? `${driver.nameAcronym} ${driver.broadcastName}`
        : driverNumber
          ? `#${driverNumber}`
          : "Team Radio";

      const id = `${driverNumber ?? "na"}-${utc}-${transcript}`;
      entries.set(id, {
        id,
        emittedAt: utc,
        driverNumber,
        label,
        transcript,
      });
    }
  }

  return [...entries.values()].sort((left, right) => right.emittedAt.localeCompare(left.emittedAt));
}

function deriveDriverStandings(leaderboard: ReturnType<typeof getLeaderboard>) {
  return leaderboard.slice(0, 21).map((entry, index) => ({
    position: index + 1,
    code: entry.shortCode ?? entry.racingNumber,
    points: RACE_POINTS[index] ?? 0,
    delta: index < 10 ? `+${RACE_POINTS[index] ?? 0}` : "-",
    movement: entry.position > index + 1 ? "up" : entry.position < index + 1 ? "down" : "same",
  }));
}

function deriveConstructorStandings(leaderboard: ReturnType<typeof getLeaderboard>) {
  const totals = new Map<string, { team: string; points: number }>();

  leaderboard.forEach((entry, index) => {
    const current = totals.get(entry.teamName) ?? { team: entry.teamName, points: 0 };
    current.points += RACE_POINTS[index] ?? 0;
    totals.set(entry.teamName, current);
  });

  return [...totals.values()]
    .sort((left, right) => right.points - left.points)
    .slice(0, 11)
    .map((entry, index) => ({
      position: index + 1,
      team: entry.team,
      points: entry.points,
      delta: entry.points > 0 ? `+${entry.points}` : "-",
    }));
}

function buildFallbackTrackModel(
  boot: SessionBoot | undefined,
  outlinePoints: TrackOutlinePoint[],
  leaderboard: ReturnType<typeof getLeaderboard>,
): TrackSurfaceModel | null {
  if (outlinePoints.length < 8 || leaderboard.length === 0) {
    return null;
  }

  const ordered = [...outlinePoints].sort((left, right) => left.pointIndex - right.pointIndex);
  const bounds = ordered.reduce(
    (summary, point) => ({
      minX: Math.min(summary.minX, point.x),
      maxX: Math.max(summary.maxX, point.x),
      minY: Math.min(summary.minY, point.y),
      maxY: Math.max(summary.maxY, point.y),
    }),
    { minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY },
  );

  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const pathPoints = ordered.map((point) => ({
    xPercent: Math.max(4, Math.min(96, ((point.x - bounds.minX) / width) * 92 + 4)),
    yPercent: Math.max(4, Math.min(96, (1 - (point.y - bounds.minY) / height) * 92 + 4)),
  }));

  const markers = leaderboard.map((entry, index) => {
    const sampleIndex = Math.min(pathPoints.length - 1, Math.floor((index / Math.max(leaderboard.length, 1)) * pathPoints.length));
    const sample = pathPoints[sampleIndex] ?? pathPoints[0]!;

    return {
      racingNumber: entry.racingNumber,
      position: entry.position,
      name: entry.name,
      shortCode: entry.shortCode ?? entry.racingNumber,
      teamName: entry.teamName,
      teamColor: entry.teamColor,
      currentCompound: entry.currentCompound,
      gapToLeader: entry.gapToLeader,
      numberOfLaps: entry.numberOfLaps,
      headshotUrl: entry.headshotUrl,
      lastLapTime: entry.lastLapTime,
      bestLapTime: entry.bestLapTime,
      progress: index / Math.max(leaderboard.length, 1),
      xPercent: sample.xPercent,
      yPercent: sample.yPercent,
    };
  });

  return {
    title: boot?.session.sessionName ?? "Track map",
    subtitle: boot?.session.sessionType ?? "Replay",
    layout: "coordinate-map",
    mode: "classification-estimate",
    markers,
    pathPoints,
  };
}

function latestTrackFramesPerDriver<T extends { driverNumber: number; emittedAt: string }>(frames: T[]) {
  const latest = new Map<number, T>();

  for (const frame of frames) {
    const current = latest.get(frame.driverNumber);
    if (!current || current.emittedAt < frame.emittedAt) {
      latest.set(frame.driverNumber, frame);
    }
  }

  return [...latest.values()];
}

function FlagChip({ flag, country }: { flag: string; country: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold tracking-[0.18em] text-white/75 uppercase">
      <span className="rounded-md bg-white/10 px-2 py-1 text-[10px] text-white">{flag}</span>
      {country}
    </div>
  );
}

function Panel({
  title,
  right,
  className,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("overflow-hidden rounded-[22px] border border-white/10 bg-[#111214] shadow-[0_18px_50px_rgba(0,0,0,0.28)]", className)}>
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-3 py-2.5">
        <h2 className="text-sm font-semibold tracking-[0.18em] text-white uppercase">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function SocialFooter() {
  return (
    <footer className="mt-8 border-t border-white/10 px-4 py-6 text-center text-xs text-white/45 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-center gap-3">
        {SOCIALS.map((social) => (
          <a
            key={social.href}
            href={social.href}
            target="_blank"
            rel="noreferrer"
            aria-label={social.label}
            className="inline-flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-semibold text-white/80 transition hover:bg-white/[0.08]"
          >
            {social.short}
          </a>
        ))}
      </div>
      <p>
        Unofficial fan project · Not affiliated with Formula One Group, FIA, or F1 teams · F1, Formula 1,
        Grand Prix and related marks are trademarks of Formula One Licensing BV
      </p>
    </footer>
  );
}

export function F1DashReplicaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<FilterType>("all");
  const [season, setSeason] = useState<number | "all">("all");
  const [query, setQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [currentTimeMs, setCurrentTimeMs] = useState<number | null>(null);
  const [mapMode, setMapMode] = useState<"2d" | "3d">("2d");
  const [expandedMap, setExpandedMap] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);

  const selectedSessionKey = Number.parseInt(searchParams.get("sessionKey") ?? "", 10);
  const deferredCurrentTimeMs = useDeferredValue(currentTimeMs);

  const catalogQuery = useQuery({
    queryKey: ["sessions", "replica", "catalog"],
    queryFn: () => fetchSessionCatalog(80, "completed"),
    staleTime: 60_000,
  });

  const rows = useMemo(
    () => (catalogQuery.data?.data ?? []).filter((row) => row.replayReady && row.hasFrames),
    [catalogQuery.data?.data],
  );

  const availableSeasons = useMemo(
    () => [...new Set(rows.map((row) => row.season))].sort((left, right) => right - left),
    [rows],
  );

  useEffect(() => {
    if (Number.isFinite(selectedSessionKey)) {
      return;
    }

    const initial = getInitialSession(rows);
    if (!initial) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("sessionKey", String(initial.sessionKey));
    router.replace(`/replica?${params.toString()}`, { scroll: false });
  }, [router, rows, searchParams, selectedSessionKey]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (season !== "all" && row.season !== season) return false;
      if (filter !== "all" && !lowerIncludes(row.sessionType, filter)) return false;
      if (query.trim()) {
        const needle = query.trim().toLowerCase();
        if (!lowerIncludes(row.meetingName, needle) && !lowerIncludes(row.sessionName, needle)) return false;
      }
      return true;
    });
  }, [filter, query, rows, season]);

  const activeSession = useMemo(
    () => rows.find((row) => row.sessionKey === selectedSessionKey) ?? null,
    [rows, selectedSessionKey],
  );

  const sessionQueriesEnabled = activeSession !== null;

  const bootQuery = useQuery({
    queryKey: ["replica", selectedSessionKey, "boot"],
    queryFn: () => fetchSessionBoot(selectedSessionKey),
    enabled: sessionQueriesEnabled,
    staleTime: 60_000,
  });
  const summaryQuery = useQuery({
    queryKey: ["replica", selectedSessionKey, "summary"],
    queryFn: () => fetchSessionSummary(selectedSessionKey),
    enabled: sessionQueriesEnabled,
    staleTime: 60_000,
  });
  const metaQuery = useQuery({
    queryKey: ["replica", selectedSessionKey, "meta"],
    queryFn: () => fetchSessionCatalogMeta(selectedSessionKey),
    enabled: sessionQueriesEnabled,
    staleTime: 60_000,
  });
  const driversQuery = useQuery({
    queryKey: ["replica", selectedSessionKey, "drivers"],
    queryFn: () => fetchSessionDrivers(selectedSessionKey),
    enabled: sessionQueriesEnabled,
    staleTime: 5 * 60_000,
  });
  const outlineQuery = useQuery({
    queryKey: ["replica", selectedSessionKey, "outline"],
    queryFn: () => fetchTrackOutline(selectedSessionKey),
    enabled: sessionQueriesEnabled,
    staleTime: 30 * 60_000,
  });
  const raceControlQuery = useQuery({
    queryKey: ["replica", selectedSessionKey, "race-control"],
    queryFn: () => fetchRaceControl(selectedSessionKey, 120),
    enabled: sessionQueriesEnabled,
    staleTime: 30_000,
  });
  const replayQuery = useInfiniteQuery({
    queryKey: ["replica", selectedSessionKey, "replay"],
    queryFn: ({ pageParam }) => fetchReplayChunks(selectedSessionKey, pageParam, pageParam),
    enabled: sessionQueriesEnabled,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (lastPage.data.length === 0) return undefined;
      const lastChunk = lastPage.data[lastPage.data.length - 1];
      return lastChunk ? lastChunk.chunkIndex + 1 : undefined;
    },
    staleTime: 60_000,
  });
  const replayPageCount = replayQuery.data?.pages.length ?? 0;
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = replayQuery;

  useEffect(() => {
    if (!sessionQueriesEnabled || !hasNextPage || isFetchingNextPage) {
      return;
    }
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, replayPageCount, sessionQueriesEnabled]);

  const replayEvents = useMemo(
    () =>
      replayQuery.data?.pages
        .flatMap((page) => page.data)
        .flatMap((chunk) => chunk.events)
        .sort((left, right) => left.sequence - right.sequence) ?? [],
    [replayQuery.data?.pages],
  );
  const replayHasTimeline =
    replayEvents.length > 1 && replayEvents[0]?.emittedAt !== replayEvents[replayEvents.length - 1]?.emittedAt;

  const startTimeMs = replayHasTimeline && replayEvents[0]
    ? Date.parse(replayEvents[0].emittedAt)
    : activeSession
      ? Date.parse(activeSession.startsAt)
      : null;
  const endTimeMs = replayHasTimeline && replayEvents[replayEvents.length - 1]
    ? Date.parse(replayEvents[replayEvents.length - 1].emittedAt)
    : metaQuery.data?.lastFrameAt
      ? Date.parse(metaQuery.data.lastFrameAt)
      : null;
  const totalDurationMs = startTimeMs !== null && endTimeMs !== null ? Math.max(0, endTimeMs - startTimeMs) : 0;
  const playbackTimeMs = currentTimeMs ?? startTimeMs;

  useEffect(() => {
    if (!isPlaying || startTimeMs === null || endTimeMs === null) {
      return;
    }

    const interval = window.setInterval(() => {
      setCurrentTimeMs((previous) => {
        const base = previous ?? startTimeMs;
        const next = base + 250 * speed;
        if (next >= endTimeMs) {
          setIsPlaying(false);
          return endTimeMs;
        }
        return next;
      });
    }, 250);

    return () => window.clearInterval(interval);
  }, [endTimeMs, isPlaying, speed, startTimeMs]);

  const currentIndex = useMemo(() => {
    if (playbackTimeMs === null || replayEvents.length === 0) return -1;
    return binarySearchEventIndex(replayEvents, playbackTimeMs);
  }, [playbackTimeMs, replayEvents]);

  const currentEvent = currentIndex >= 0 ? replayEvents[currentIndex] : null;
  const replayBoot = useMemo(
    () => applyReplayBoot(bootQuery.data, replayEvents, currentIndex),
    [bootQuery.data, currentIndex, replayEvents],
  );

  const leaderboard = useMemo(() => getLeaderboard(replayBoot), [replayBoot]);
  const driverStandings = useMemo(() => deriveDriverStandings(leaderboard), [leaderboard]);
  const constructorStandings = useMemo(() => deriveConstructorStandings(leaderboard), [leaderboard]);

  const sampledTrackTime = useMemo(() => {
    const referenceTime = deferredCurrentTimeMs ?? playbackTimeMs;
    if (referenceTime === null) return undefined;
    const rounded = Math.floor(referenceTime / 2000) * 2000;
    return new Date(rounded).toISOString();
  }, [deferredCurrentTimeMs, playbackTimeMs]);

  const trackFrameQuery = useQuery({
    queryKey: ["replica", selectedSessionKey, "track-frame", sampledTrackTime],
    queryFn: () => fetchTrackReplayFrame(selectedSessionKey, sampledTrackTime ?? ""),
    enabled: sessionQueriesEnabled && Boolean(sampledTrackTime),
    staleTime: 2_000,
  });

  const trackDisplayFrames = useMemo(
    () => latestTrackFramesPerDriver(trackFrameQuery.data?.data ?? []),
    [trackFrameQuery.data?.data],
  );

  const trackModel = useMemo(
    () =>
      getTrackSurfaceModelFromFrames({
        boot: replayBoot,
        displayPositions: trackDisplayFrames,
        sessionDrivers: driversQuery.data?.data ?? [],
        outlinePoints: outlineQuery.data?.data ?? [],
      }),
    [driversQuery.data?.data, outlineQuery.data?.data, replayBoot, trackDisplayFrames],
  );
  const fallbackTrackModel = useMemo(
    () => buildFallbackTrackModel(replayBoot, outlineQuery.data?.data ?? [], leaderboard),
    [leaderboard, outlineQuery.data?.data, replayBoot],
  );
  const activeTrackModel = trackModel ?? fallbackTrackModel;

  const visibleRaceControl = useMemo(() => {
    const now = playbackTimeMs ?? Number.POSITIVE_INFINITY;
    return (raceControlQuery.data?.data ?? [])
      .filter((item) => Date.parse(item.emittedAt) <= now)
      .sort((left, right) => right.emittedAt.localeCompare(left.emittedAt))
      .slice(0, 20);
  }, [playbackTimeMs, raceControlQuery.data?.data]);

  const teamRadio = useMemo(
    () => extractTeamRadioEntries(replayEvents, currentIndex, driversQuery.data?.data ?? []).slice(0, 22),
    [currentIndex, driversQuery.data?.data, replayEvents],
  );

  const weather = extractWeather(replayBoot);
  const trackStatus = extractTrackStatus(replayBoot);
  const location = activeSession ? inferLocation(activeSession.meetingName) : inferLocation("");

  const driverCount = summaryQuery.data?.driverCount ?? activeSession?.driverCount ?? leaderboard.length;
  const locationCount = metaQuery.data?.outlinePointCount ?? outlineQuery.data?.data.length ?? 0;
  const carCount = trackFrameQuery.data?.data.length ?? 0;

  const loadingReplay =
    activeSession !== null &&
    (bootQuery.isLoading || replayQuery.isLoading || currentEvent === null || replayEvents.length === 0);

  const desktopLiveTiming = (
    <Panel
      title="Live Timing"
      right={<span className="text-xs text-white/55">{leaderboard.length} drivers</span>}
      className="h-full"
    >
      <div className="overflow-auto px-3 py-2 text-xs text-white/88">
        <div className="grid min-w-[480px] grid-cols-[40px_1.2fr_70px_76px_64px_52px] gap-2 border-b border-white/10 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
          <div>Pos</div>
          <div>Driver</div>
          <div>Gap</div>
          <div>Sectors</div>
          <div>Lap</div>
          <div>DRS</div>
        </div>
        <div className="space-y-1 py-2">
          {leaderboard.map((entry) => (
            <div key={entry.racingNumber} className="grid min-w-[480px] grid-cols-[40px_1.2fr_70px_76px_64px_52px] items-center gap-2 rounded-xl bg-white/[0.025] px-2 py-2">
              <div className="font-semibold text-white">{entry.position}</div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex min-w-10 justify-center rounded-md px-2 py-1 text-[10px] font-bold text-black" style={{ backgroundColor: `#${entry.teamColor}` }}>
                    {entry.shortCode ?? entry.racingNumber}
                  </span>
                  <div className="truncate text-white">{entry.name}</div>
                </div>
                <div className="truncate text-[10px] text-white/40">#{entry.racingNumber} {entry.teamName}</div>
              </div>
              <div className="text-white/65">{entry.gapToLeader ?? (entry.position === 1 ? "P1" : "--")}</div>
              <div className="text-white/55">{entry.sectors.map((sector) => sector.value ?? "--").slice(0, 3).join(" ")}</div>
              <div className="text-white/65">{entry.numberOfLaps ?? "--"}</div>
              <div className="text-white/55">{entry.inPit ? "PIT" : "DRS"}</div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );

  return (
    <div className="min-h-screen bg-[#090a0b] text-[#ededed]">
      <div className="fixed inset-x-0 top-0 z-[90] bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 px-4 py-1.5 text-center text-xs font-semibold tracking-[0.12em] text-black shadow-lg">
        <span className="inline-flex items-center gap-2">
          <AlertTriangle className="size-3.5 animate-pulse" />
          This site is in very early alpha — features may be incomplete or change without notice
          <AlertTriangle className="size-3.5 animate-pulse" />
        </span>
      </div>

      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block lg:w-64 lg:border-r lg:border-white/10 lg:bg-[#0f1012] lg:pt-8">
        <div className="flex h-full flex-col pt-8">
          <div className="px-4 pb-4">
            <Link href="/replica" className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[#e10600] text-sm font-black text-white">F1</div>
              <div>
                <div className="text-xs tracking-[0.28em] text-white/45 uppercase">F1Dash</div>
                <div className="text-sm font-semibold text-white">Live Timing</div>
              </div>
            </Link>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
            <div className="px-2 py-2 text-[11px] tracking-[0.24em] text-white/35 uppercase">Navigation</div>
            {NAV_ITEMS.map((item) => {
              const active = item.href === "/replica";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block rounded-xl border px-3 py-2.5 transition",
                    active ? "border-white/15 bg-white/[0.07]" : "border-transparent hover:border-white/10 hover:bg-white/[0.04]",
                  )}
                >
                  <div className="text-sm font-medium text-white">{item.label}</div>
                  {item.description ? <div className="text-xs text-white/42">{item.description}</div> : null}
                </Link>
              );
            })}
          </nav>

          <div className="space-y-3 border-t border-white/10 px-4 py-4">
            <button className="flex w-full items-center justify-center rounded-xl bg-[#e10600] px-4 py-3 text-sm font-semibold text-white">Log In</button>
            <button className="flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white">Sign Up</button>
            <div className="text-center text-xs text-white/35">v1.0.6 • 2026 Season</div>
          </div>
        </div>
      </div>

      <div className="lg:ml-64">
        <header className="sticky top-6 z-40 border-b border-white/10 bg-[#090a0b]/96 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Link href="/replica" className="inline-flex items-center gap-2 text-sm font-black tracking-[0.22em] text-white uppercase">
              <span className="inline-flex size-9 items-center justify-center rounded-xl bg-[#e10600] text-white">F1</span>
              F1DASH
            </Link>
            <button
              type="button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMobileMenuOpen((value) => !value)}
              className="inline-flex size-10 items-center justify-center rounded-lg bg-white/5"
            >
              {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
          {mobileMenuOpen ? (
            <div className="border-t border-white/10 bg-[#111214] px-3 py-3">
              <div className="max-h-[56vh] space-y-1 overflow-y-auto pr-1">
                {NAV_ITEMS.map((item) => (
                  <Link key={item.href} href={item.href} className="block rounded-xl px-3 py-2.5 hover:bg-white/[0.05]" onClick={() => setMobileMenuOpen(false)}>
                    <div className="text-sm font-medium text-white">{item.label}</div>
                    {item.description ? <div className="text-xs text-white/42">{item.description}</div> : null}
                  </Link>
                ))}
              </div>
              <div className="mt-3 grid gap-2 border-t border-white/10 pt-3">
                <button className="rounded-xl bg-[#e10600] px-4 py-3 text-sm font-semibold text-white">Log In</button>
                <button className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white">Sign Up</button>
                <div className="text-center text-xs text-white/35">v1.0.6 • 2026 Season</div>
              </div>
            </div>
          ) : null}
        </header>

        <main className="min-h-screen px-4 pb-6 pt-24 sm:px-6 lg:px-8 lg:pt-8">
          <div className="mx-auto max-w-[1580px]">
            {loadingReplay && activeSession ? (
              <div className="flex min-h-[72vh] flex-col items-center justify-center rounded-[28px] border border-white/10 bg-[#111214] text-center">
                <div className="mb-3 text-5xl font-black tracking-[-0.05em] text-white/90">{Math.min(95, Math.max(8, replayQuery.data?.pages.length ? replayQuery.data.pages.length * 12 : 15))}%</div>
                <p className="text-sm text-white/60">Loading race control...</p>
                <p className="mt-1 text-xs text-white/35">Session: {activeSession.sessionKey}</p>
              </div>
            ) : activeSession ? (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-white/10 bg-[#111214] px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.28)] sm:px-6">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <FlagChip flag={location.flag} country={location.country} />
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-white sm:text-lg">{activeSession.meetingName}</h2>
                        <p className="text-sm text-white/55">{activeSession.sessionType} • {location.city}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => setIsPlaying((value) => !value)} className="inline-flex size-10 items-center justify-center rounded-xl bg-white/[0.06] hover:bg-white/[0.1]">
                        {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                      </button>
                      {SPEEDS.map((value) => (
                        <button
                          key={value}
                          onClick={() => setSpeed(value)}
                          className={cn(
                            "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
                            speed === value ? "bg-[#e10600] text-white" : "bg-transparent text-white/75 hover:bg-white/[0.06]",
                          )}
                        >
                          {value}x
                        </button>
                      ))}
                        <div className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-white/65">
                        Elapsed: {formatClock((playbackTimeMs ?? startTimeMs ?? 0) - (startTimeMs ?? 0))} {playbackTimeMs ? formatWallClock(playbackTimeMs) : ""}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <input
                      type="range"
                      min={0}
                      max={totalDurationMs || 1}
                      value={startTimeMs !== null && playbackTimeMs !== null ? playbackTimeMs - startTimeMs : 0}
                      onChange={(event) => setCurrentTimeMs((startTimeMs ?? 0) + Number(event.target.value))}
                      className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-white/45">
                    <div>{driverCount} drivers {visibleRaceControl.length} RC msgs Loc: {locationCount}, Car: {carCount}</div>
                    <button
                      onClick={() => {
                        const params = new URLSearchParams(searchParams.toString());
                        params.delete("sessionKey");
                        router.replace(`/replica${params.toString() ? `?${params.toString()}` : ""}`);
                      }}
                      className="rounded-lg bg-white/[0.05] px-3 py-1.5 text-white/75 transition hover:bg-white/[0.1]"
                    >
                      Exit Replay
                    </button>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-[#111214] px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)] sm:px-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-xs tracking-[0.25em] text-white/35 uppercase">{activeSession.season}</div>
                    <h1 className="text-2xl font-black tracking-[-0.04em] text-white sm:text-[2rem]">{activeSession.meetingName}</h1>
                    <p className="text-sm text-white/60">{activeSession.sessionType}</p>
                    <div className={cn("rounded-full px-3 py-1 text-xs font-bold tracking-[0.14em] uppercase", trackStatus.pill)}>{trackStatus.label}</div>
                    <button
                      onClick={() => setSoundEnabled((value) => !value)}
                      aria-label="Enable sound notifications"
                      title="Click to enable sound notifications"
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/75"
                    >
                      {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                      {soundEnabled ? "Enabled" : "Muted"}
                    </button>
                    <Link href="/help" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/75">
                      <HelpCircle className="size-4" />
                      Help
                    </Link>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/65">
                    <span>Air {weather.air} °C</span>
                    <span>Track {weather.track} °C</span>
                    <span>Humidity {weather.humidity} %</span>
                    <span>Wind {weather.wind} km/h ↑</span>
                    <span>Rain {weather.rain}</span>
                    <span>Delay</span>
                    <button className="rounded-lg bg-white/[0.05] px-2 py-1 text-white/75"><ChevronLeft className="size-4" /></button>
                    <input value="0ms" readOnly className="w-16 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-center text-white" />
                    <button className="rounded-lg bg-white/[0.05] px-2 py-1 text-white/75"><ChevronRight className="size-4" /></button>
                  </div>
                </div>

                <div className="space-y-4 lg:hidden">
                  {desktopLiveTiming}
                  <Panel title="Track Map" right={<button onClick={() => setMapMode((value) => (value === "2d" ? "3d" : "2d"))} className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white">{mapMode === "2d" ? "3D" : "2D"}</button>}>
                    <div className="px-3 py-3">
                      {activeTrackModel ? (
                        <div className={cn("overflow-hidden rounded-[18px] bg-[#08090a]", mapMode === "3d" && "[transform:perspective(1200px)_rotateX(50deg)] origin-center transition-transform duration-500")}>
                          <ReplayTrackCanvas model={activeTrackModel} viewMode="2d" chrome={false} interactive={false} />
                        </div>
                      ) : (
                        <div className="flex h-56 items-center justify-center rounded-[18px] bg-[#08090a] text-sm text-white/45">Loading Map</div>
                      )}
                    </div>
                  </Panel>
                </div>

                <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1.45fr)_minmax(360px,1fr)]">
                  <div className="col-span-2">
                    <Panel
                      title="Track Map"
                      right={
                        <div className="flex items-center gap-2">
                          <button onClick={() => setMapMode((value) => (value === "2d" ? "3d" : "2d"))} title={`Switch to ${mapMode === "2d" ? "3D" : "2D"} Map`} className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white">
                            {mapMode === "2d" ? "3D" : "2D"}
                          </button>
                          <button onClick={() => setExpandedMap((value) => !value)} className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white">{expandedMap ? "Collapse" : "Expand"}</button>
                        </div>
                      }
                      className={expandedMap ? "lg:min-h-[44rem]" : "lg:min-h-[31rem]"}
                    >
                      <div className="px-4 py-4">
                        {activeTrackModel ? (
                          <div className={cn("overflow-hidden rounded-[20px] bg-[#08090a] transition-transform duration-500", mapMode === "3d" && "[transform:perspective(1200px)_rotateX(52deg)] origin-center")}>
                            <ReplayTrackCanvas model={activeTrackModel} viewMode="2d" chrome={false} interactive={false} />
                          </div>
                        ) : (
                          <div className="flex h-[27rem] items-center justify-center rounded-[20px] bg-[#08090a] text-sm text-white/45">Loading track positions...</div>
                        )}
                        <div className="mt-3 text-xs text-white/45">S1 S2 S3 Sector boundaries are estimates based on timing data</div>
                      </div>
                    </Panel>
                  </div>
                  <div className="row-span-3 min-h-[58rem]">{desktopLiveTiming}</div>

                  <div className="col-span-2 grid gap-4 md:grid-cols-3">
                    <Panel title="Race Control" right={<span className="text-xs text-white/55">{visibleRaceControl.length} RC</span>}>
                      <div className="max-h-[24rem] space-y-3 overflow-y-auto px-3 py-3 text-sm">
                        {visibleRaceControl.map((message) => (
                          <article key={`${message.sequence}-${message.emittedAt}`} className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                            <div className="text-[11px] tracking-[0.16em] text-white/45 uppercase">{formatWallClock(Date.parse(message.emittedAt))} {message.flag ?? message.category}</div>
                            <p className="mt-1 text-white/90">{message.body}</p>
                          </article>
                        ))}
                      </div>
                    </Panel>

                    <Panel title="Team Radio">
                      <div className="max-h-[24rem] space-y-2 overflow-y-auto px-3 py-3 text-sm">
                        {teamRadio.length > 0 ? (
                          teamRadio.map((entry) => (
                            <article key={entry.id} className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-medium text-white">{entry.label}</div>
                                <button className="rounded-lg bg-white/[0.06] px-2 py-1 text-xs text-white">▶ 00:00</button>
                              </div>
                              <div className="mt-1 text-[11px] text-white/42">{formatClock(Math.max(0, Date.parse(entry.emittedAt) - (startTimeMs ?? 0)))}</div>
                              <p className="mt-1 text-white/70">{entry.transcript}</p>
                            </article>
                          ))
                        ) : (
                          <div className="rounded-xl bg-white/[0.03] px-3 py-4 text-white/55">No transcription available</div>
                        )}
                      </div>
                    </Panel>

                    <Panel title="Incidents">
                      <div className="max-h-[24rem] space-y-3 overflow-y-auto px-3 py-3 text-sm">
                        <div className="rounded-xl bg-white/[0.03] px-3 py-2.5 text-white/65">
                          {visibleRaceControl.filter((message) => lowerIncludes(message.body, "penalty")).length} Pen {" "}
                          {visibleRaceControl.filter((message) => lowerIncludes(message.body, "warning")).length} Warn {" "}
                          {visibleRaceControl.filter((message) => lowerIncludes(message.body, "investigation")).length} Inv 0 Sec
                        </div>
                        {visibleRaceControl
                          .filter((message) => lowerIncludes(message.body, "investigation") || lowerIncludes(message.body, "incident") || lowerIncludes(message.body, "penalty"))
                          .slice(0, 8)
                          .map((message) => (
                            <article key={`incident-${message.sequence}`} className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                              <div className="text-[11px] text-white/42">{formatWallClock(Date.parse(message.emittedAt))}</div>
                              <p className="mt-1 text-white/82">{message.body}</p>
                            </article>
                          ))}
                      </div>
                    </Panel>
                  </div>

                  <div className="col-span-2 grid gap-4 md:grid-cols-2">
                    <Panel title="Driver Standings">
                      <div className="overflow-auto px-3 py-2">
                        <table className="w-full text-sm text-white/86">
                          <thead className="text-left text-[10px] tracking-[0.16em] text-white/40 uppercase">
                            <tr>
                              <th className="py-2">P</th>
                              <th className="py-2">Driver</th>
                              <th className="py-2">Pts</th>
                              <th className="py-2">+/-</th>
                            </tr>
                          </thead>
                          <tbody>
                            {driverStandings.map((entry) => (
                              <tr key={entry.position} className="border-t border-white/8">
                                <td className="py-2">{entry.position}</td>
                                <td className="py-2">{entry.movement === "up" ? "▲ " : entry.movement === "down" ? "▼ " : ""}{entry.code}</td>
                                <td className="py-2">{entry.points}</td>
                                <td className="py-2">{entry.delta}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                    <Panel title="Constructor Standings">
                      <div className="overflow-auto px-3 py-2">
                        <table className="w-full text-sm text-white/86">
                          <thead className="text-left text-[10px] tracking-[0.16em] text-white/40 uppercase">
                            <tr>
                              <th className="py-2">P</th>
                              <th className="py-2">Team</th>
                              <th className="py-2">Pts</th>
                              <th className="py-2">+/-</th>
                            </tr>
                          </thead>
                          <tbody>
                            {constructorStandings.map((entry) => (
                              <tr key={entry.team} className="border-t border-white/8">
                                <td className="py-2">{entry.position}</td>
                                <td className="py-2">{entry.team}</td>
                                <td className="py-2">{entry.points}</td>
                                <td className="py-2">{entry.delta}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  </div>
                </div>

                <div className="space-y-4 lg:hidden">
                  <Panel title="Race Control" right={<span className="text-xs text-white/55">{visibleRaceControl.length} RC</span>}>
                    <div className="max-h-[19rem] space-y-3 overflow-y-auto px-3 py-3 text-sm">
                      {visibleRaceControl.map((message: RaceControlMessage) => (
                        <article key={`${message.sequence}-${message.emittedAt}`} className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                          <div className="text-[11px] tracking-[0.16em] text-white/45 uppercase">{formatWallClock(Date.parse(message.emittedAt))} {message.flag ?? message.category}</div>
                          <p className="mt-1 text-white/90">{message.body}</p>
                        </article>
                      ))}
                    </div>
                  </Panel>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Panel title="Team Radio">
                      <div className="max-h-[14rem] space-y-2 overflow-y-auto px-3 py-3 text-sm">
                        {teamRadio.length > 0 ? teamRadio.map((entry) => (
                          <article key={entry.id} className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                            <div className="font-medium text-white">{entry.label}</div>
                            <p className="mt-1 text-white/65">{entry.transcript}</p>
                          </article>
                        )) : <div className="rounded-xl bg-white/[0.03] px-3 py-4 text-white/55">0 TR No Radio</div>}
                      </div>
                    </Panel>
                    <Panel title="Incidents">
                      <div className="max-h-[14rem] space-y-2 overflow-y-auto px-3 py-3 text-sm">
                        {visibleRaceControl.filter((message) => lowerIncludes(message.body, "investigation") || lowerIncludes(message.body, "incident") || lowerIncludes(message.body, "penalty")).slice(0, 6).map((message) => (
                          <article key={`m-${message.sequence}`} className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                            <p className="text-white/82">{message.body}</p>
                          </article>
                        ))}
                        <div className="text-center text-xs text-white/35">&larr; Swipe for more panels &rarr;</div>
                      </div>
                    </Panel>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Panel title="Driver Standings">
                      <div className="overflow-auto px-3 py-2">
                        <table className="w-full text-sm text-white/86">
                          <tbody>
                            {driverStandings.slice(0, 12).map((entry) => (
                              <tr key={entry.position} className="border-t border-white/8">
                                <td className="py-2">{entry.position}</td>
                                <td className="py-2">{entry.code}</td>
                                <td className="py-2">{entry.points}</td>
                                <td className="py-2">{entry.delta}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                    <Panel title="Constructor Standings">
                      <div className="overflow-auto px-3 py-2">
                        <table className="w-full text-sm text-white/86">
                          <tbody>
                            {constructorStandings.map((entry) => (
                              <tr key={entry.team} className="border-t border-white/8">
                                <td className="py-2">{entry.position}</td>
                                <td className="py-2">{entry.team}</td>
                                <td className="py-2">{entry.points}</td>
                                <td className="py-2">{entry.delta}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.65fr)]">
                <section className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(225,6,0,0.22),transparent_55%),#111214] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold tracking-[0.24em] text-white/55 uppercase">
                    <Copy className="size-3.5" />
                    Replica Route
                  </div>
                  <h1 className="mt-5 text-3xl font-black tracking-[-0.05em] text-white sm:text-5xl">Race Replay</h1>
                  <p className="mt-4 max-w-xl text-base leading-7 text-white/58">
                    Relive historic F1 sessions with full timing, radio, race control, a live-style track map, and a one-route replay dashboard that mirrors the public F1Dash experience.
                  </p>
                  <div className="mt-8 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                      <div className="text-xs tracking-[0.2em] text-white/40 uppercase">Playback</div>
                      <div className="mt-2 text-lg font-semibold text-white">1x · 2x · 5x · 10x</div>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                      <div className="text-xs tracking-[0.2em] text-white/40 uppercase">Panels</div>
                      <div className="mt-2 text-lg font-semibold text-white">Timing · Map · RC · Radio</div>
                    </div>
                  </div>
                </section>

                <section className="rounded-[28px] border border-white/10 bg-[#111214] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-xl font-bold tracking-[-0.03em] text-white">Replay Catalog</h2>
                      <p className="mt-1 text-sm text-white/42">{filteredRows.length} sessions available for replay</p>
                    </div>
                    <div className="relative w-full md:w-72">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
                      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions..." className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/28 focus:border-white/25" />
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {availableSeasons.map((value) => (
                      <button key={value} onClick={() => setSeason(value)} className={cn("rounded-xl px-3 py-2 text-sm font-semibold transition", season === value ? "bg-white text-black" : "bg-white/[0.05] text-white/72 hover:bg-white/[0.08]")}>{value}</button>
                    ))}
                    <button onClick={() => setSeason("all")} className={cn("rounded-xl px-3 py-2 text-sm font-semibold transition", season === "all" ? "bg-white text-black" : "bg-white/[0.05] text-white/72 hover:bg-white/[0.08]")}>All</button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {([
                      ["All", "all"],
                      ["Race", "race"],
                      ["Qualifying", "qualifying"],
                      ["Practice", "practice"],
                      ["Sprint", "sprint"],
                    ] as const).map(([label, value]) => (
                      <button key={value} onClick={() => setFilter(value)} className={cn("rounded-full px-3 py-1.5 text-sm font-medium transition", filter === value ? "bg-[#e10600] text-white" : "bg-white/[0.05] text-white/70 hover:bg-white/[0.08]")}>{label}</button>
                    ))}
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    {filteredRows.map((row) => {
                      const inferred = inferLocation(row.meetingName);
                      return (
                        <button
                          key={row.sessionKey}
                          type="button"
                          onClick={() => {
                            setCurrentTimeMs(null);
                            setIsPlaying(true);
                            router.replace(`/replica?sessionKey=${row.sessionKey}`, { scroll: false });
                          }}
                          className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
                        >
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.18em] uppercase", classForSessionType(row.sessionType))}>{row.sessionType}</span>
                            <span className="text-[11px] text-white/35">{row.frameCount.toLocaleString()} frames</span>
                          </div>
                          <h3 className="text-lg font-bold leading-tight text-white">{row.meetingName}</h3>
                          <p className="mt-1 text-sm text-white/45">{inferred.city} • {inferred.country}</p>
                          <p className="mt-2 text-sm text-white/62">{formatCardDate(row.startsAt)}</p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}

            <SocialFooter />
          </div>
        </main>
      </div>
    </div>
  );
}
