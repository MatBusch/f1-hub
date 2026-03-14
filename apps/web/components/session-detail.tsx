"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CloudSun,
  Flag,
  FlagTriangleRight,
  Medal,
  Milestone,
  Pause,
  Play,
  RadioTower,
  SkipBack,
  SkipForward,
  Thermometer,
  TimerReset,
  Waves,
  Wind,
} from "lucide-react";
import { type TrackPositionFrame } from "@f1-hub/contracts";

import {
  fetchSessionDrivers,
  fetchLiveWindow,
  fetchRaceControl,
  fetchReplayChunks,
  fetchSessionBoot,
  fetchSessionSummary,
  fetchTrackPositionFrames,
  fetchTrackLatestPositions,
  fetchTrackOutline,
  fetchTrackReplayFrame,
} from "@/lib/api";
import {
  getSessionState,
  getDriverStatusBreakdown,
  getCompoundBreakdown,
  getBootTopicCoverage,
  getLeaderboard,
  getSessionBenchmarks,
  getTrackSurfaceModelFromFrames,
  getTrackSurfaceModel,
  getStintOverview,
  getWeather,
} from "@/lib/session-insights";
import { TrackSurface } from "@/components/track-surface";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatReplayDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "00:00";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0",
    )}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0",
  )}`;
}

function findNearestReplayIndex(timestamps: number[], targetTimestamp: number) {
  if (timestamps.length === 0) {
    return 0;
  }

  let low = 0;
  let high = timestamps.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);

    if (timestamps[mid]! < targetTimestamp) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const candidate = low;
  const previous = Math.max(candidate - 1, 0);
  const candidateDelta = Math.abs(timestamps[candidate]! - targetTimestamp);
  const previousDelta = Math.abs(timestamps[previous]! - targetTimestamp);

  return previousDelta <= candidateDelta ? previous : candidate;
}

function getSectorTone(overallFastest: boolean, personalFastest: boolean) {
  if (overallFastest) {
    return "border-emerald-500/40 bg-emerald-500/12 text-emerald-200";
  }

  if (personalFastest) {
    return "border-fuchsia-500/40 bg-fuchsia-500/12 text-fuchsia-100";
  }

  return "border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)]";
}

function hasRenderableTrackCoordinates(frame: TrackPositionFrame) {
  if (frame.x == null || frame.y == null) {
    return false;
  }

  return !(frame.x === 0 && frame.y === 0 && (frame.z ?? 0) === 0);
}

export function SessionDetail({ sessionKey }: { sessionKey: number }) {
  const [intelligenceView, setIntelligenceView] = useState<
    "standings" | "stints" | "control" | "replay"
  >("standings");

  const summaryQuery = useQuery({
    queryKey: ["session", sessionKey, "summary"],
    queryFn: () => fetchSessionSummary(sessionKey),
    staleTime: 60_000,
  });
  const summary = summaryQuery.data;
  const isLiveSession = summary?.status === "live";
  const bootQuery = useQuery({
    queryKey: ["session", sessionKey, "boot"],
    queryFn: () => fetchSessionBoot(sessionKey),
    enabled: isLiveSession,
    staleTime: 30 * 60_000,
  });
  const shouldLoadRaceControl = isLiveSession || intelligenceView === "control";

  const liveWindowQuery = useQuery({
    queryKey: [
      "session",
      sessionKey,
      "live",
      summaryQuery.data?.lastSequence ?? 0,
    ],
    queryFn: () =>
      fetchLiveWindow(
        sessionKey,
        Math.max((summaryQuery.data?.lastSequence ?? 0) - 12, 0),
        12,
      ),
    enabled: summaryQuery.isSuccess,
    staleTime: isLiveSession ? 0 : 60_000,
    refetchInterval: isLiveSession ? 15_000 : false,
  });

  const raceControlQuery = useQuery({
    queryKey: ["session", sessionKey, "race-control"],
    queryFn: () => fetchRaceControl(sessionKey),
    enabled: summaryQuery.isSuccess && shouldLoadRaceControl,
    staleTime: isLiveSession ? 0 : 10 * 60_000,
    refetchInterval: isLiveSession ? 30_000 : false,
  });
  const sessionDriversQuery = useQuery({
    queryKey: ["session", sessionKey, "track", "drivers"],
    queryFn: () => fetchSessionDrivers(sessionKey),
    enabled: summaryQuery.isSuccess,
    staleTime: 30 * 60_000,
  });
  const trackLatestQuery = useQuery({
    queryKey: ["session", sessionKey, "track", "latest"],
    queryFn: () => fetchTrackLatestPositions(sessionKey),
    enabled: summaryQuery.isSuccess,
    staleTime: isLiveSession ? 0 : 60_000,
    refetchInterval: isLiveSession ? 15_000 : false,
  });
  const trackOutlineQuery = useQuery({
    queryKey: ["session", sessionKey, "track", "outline"],
    queryFn: () => fetchTrackOutline(sessionKey),
    enabled: summaryQuery.isSuccess,
    staleTime: 30 * 60_000,
  });
  const latestTrackPositions = trackLatestQuery.data?.data ?? [];
  const shouldLoadReplayInsights = intelligenceView === "replay";
  const fallbackOutlineDriverNumber =
    sessionDriversQuery.data?.data?.[0]?.driverNumber ??
    latestTrackPositions[0]?.driverNumber;
  const fallbackTrackPathQuery = useQuery({
    queryKey: [
      "session",
      sessionKey,
      "track",
      "path-fallback",
      fallbackOutlineDriverNumber ?? 0,
    ],
    queryFn: () =>
      fetchTrackPositionFrames(sessionKey, {
        driverNumber: fallbackOutlineDriverNumber,
        limit: 12000,
      }),
    enabled:
      summaryQuery.isSuccess &&
      (trackOutlineQuery.data?.data?.length ?? 0) === 0 &&
      fallbackOutlineDriverNumber !== undefined,
    staleTime: 30 * 60_000,
  });
  const hasPositionFrames = latestTrackPositions.length > 0;
  const replayDataEnabled =
    summaryQuery.isSuccess &&
    hasPositionFrames &&
    fallbackOutlineDriverNumber !== undefined;
  const replayQuery = useQuery({
    queryKey: ["session", sessionKey, "replay"],
    queryFn: () => fetchReplayChunks(sessionKey, 0, 5),
    enabled: summaryQuery.isSuccess && shouldLoadReplayInsights,
    staleTime: 30 * 60_000,
  });
  const replayTimelineFramesQuery = useQuery({
    queryKey: [
      "session",
      sessionKey,
      "track",
      "timeline",
      fallbackOutlineDriverNumber ?? 0,
    ],
    queryFn: () =>
      fetchTrackPositionFrames(sessionKey, {
        driverNumber: fallbackOutlineDriverNumber,
        limit: 8_000,
      }),
    enabled:
      replayDataEnabled &&
      shouldLoadReplayInsights &&
      (replayQuery.data?.data?.length ?? 0) === 0,
    staleTime: 30 * 60_000,
  });
  const boot = bootQuery.data;
  const liveWindow = liveWindowQuery.data?.data ?? [];
  const raceControl = raceControlQuery.data?.data ?? [];
  const replayChunks = replayQuery.data?.data ?? [];
  const bootTopicCount = boot ? Object.keys(boot.state).length : 0;
  const latestEnvelope = liveWindow[liveWindow.length - 1];
  const firstReplay = replayChunks[0];
  const lastReplay = replayChunks[replayChunks.length - 1];
  const leaderboard = useMemo(() => getLeaderboard(boot), [boot]);
  const topDrivers = leaderboard.slice(0, 3);
  const stintOverview = useMemo(() => getStintOverview(boot), [boot]);
  const driverStatusBreakdown = useMemo(
    () => getDriverStatusBreakdown(boot),
    [boot],
  );
  const compoundBreakdown = useMemo(() => getCompoundBreakdown(boot), [boot]);
  const bootTopicCoverage = useMemo(() => getBootTopicCoverage(boot), [boot]);
  const sessionBenchmarks = useMemo(() => getSessionBenchmarks(boot), [boot]);
  const weather = useMemo(() => getWeather(boot), [boot]);
  const sessionState = useMemo(() => getSessionState(boot), [boot]);
  const replayEvents = useMemo(
    () => replayChunks.flatMap((chunk) => chunk.events),
    [replayChunks],
  );
  const replayEventTimes = useMemo(
    () => replayEvents.map((event) => Date.parse(event.emittedAt)),
    [replayEvents],
  );
  const replayTimelineFrameTimes = useMemo(() => {
    const timestamps =
      replayTimelineFramesQuery.data?.data
        .filter(hasRenderableTrackCoordinates)
        .map((frame) => Date.parse(frame.emittedAt))
        .filter((value) => Number.isFinite(value)) ?? [];

    return timestamps.filter(
      (timestamp, index) => index === 0 || timestamp !== timestamps[index - 1],
    );
  }, [replayTimelineFramesQuery.data?.data]);
  const replayTimelineTimes = useMemo(() => {
    const distinctReplayEventTimes = replayEventTimes.filter(
      (timestamp, index) =>
        index === 0 || timestamp !== replayEventTimes[index - 1],
    );

    return distinctReplayEventTimes.length > 1
      ? distinctReplayEventTimes
      : replayTimelineFrameTimes;
  }, [replayEventTimes, replayTimelineFrameTimes]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [isTrackReplayEnabled, setIsTrackReplayEnabled] = useState(false);
  function activateReplayAtIndex(nextIndex: number) {
    setIsTrackReplayEnabled(true);
    setIsReplayPlaying(false);
    setReplayIndex(nextIndex);
  }

  function seekReplayToTimestamp(targetTimestamp: number) {
    activateReplayAtIndex(
      findNearestReplayIndex(replayTimelineTimes, targetTimestamp),
    );
  }

  const replayCurrentMs =
    replayTimelineTimes[replayIndex] ?? replayTimelineTimes[0] ?? 0;
  const activeReplayEvent =
    replayEvents[
      replayEvents.length > 0
        ? findNearestReplayIndex(replayEventTimes, replayCurrentMs)
        : 0
    ];
  const replayWindowQuery = useQuery({
    queryKey: [
      "session",
      sessionKey,
      "track",
      "replay-window",
      replayCurrentMs,
    ],
    queryFn: () =>
      fetchTrackReplayFrame(
        sessionKey,
        new Date(replayCurrentMs).toISOString(),
        1500,
      ),
    enabled: isTrackReplayEnabled && replayCurrentMs > 0 && hasPositionFrames,
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });
  const replayRenderableTrackPositions = useMemo(
    () =>
      (replayWindowQuery.data?.data ?? []).filter(hasRenderableTrackCoordinates),
    [replayWindowQuery.data?.data],
  );
  const replayTrackPositions = useMemo(
    () => replayWindowQuery.data?.data ?? [],
    [replayWindowQuery.data?.data],
  );
  const [stableReplayTrackPositions, setStableReplayTrackPositions] = useState<
    TrackPositionFrame[]
  >([]);
  const isTrackReplayActive =
    isTrackReplayEnabled && replayCurrentMs > 0 && hasPositionFrames;
  const displayTrackPositions =
    isTrackReplayActive &&
    (replayTrackPositions.length > 0 || stableReplayTrackPositions.length > 0)
      ? replayRenderableTrackPositions.length > 0
        ? replayRenderableTrackPositions
        : stableReplayTrackPositions
      : latestTrackPositions;
  const trackSurfaceModel = useMemo(
    () =>
      getTrackSurfaceModelFromFrames({
        boot,
        displayPositions: displayTrackPositions,
        sessionDrivers: sessionDriversQuery.data?.data ?? [],
        outlinePoints: trackOutlineQuery.data?.data ?? [],
        outlineFrames:
          replayTimelineFramesQuery.data?.data ??
          fallbackTrackPathQuery.data?.data ??
          [],
      }) ?? getTrackSurfaceModel(boot, hasPositionFrames),
    [
      boot,
      hasPositionFrames,
      displayTrackPositions,
      sessionDriversQuery.data?.data,
      trackOutlineQuery.data?.data,
      replayTimelineFramesQuery.data?.data,
      fallbackTrackPathQuery.data?.data,
    ],
  );
  const replayTopicBreakdown = useMemo(() => {
    const counts = new Map<string, number>();

    for (const event of replayEvents) {
      counts.set(event.topic, (counts.get(event.topic) ?? 0) + 1);
    }

    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [replayEvents]);
  const recentSignalBursts = useMemo(
    () => [...liveWindow].sort((left, right) => right.sequence - left.sequence),
    [liveWindow],
  );
  const bootCoverageCount = bootTopicCoverage.filter(
    (entry) => entry.available,
  ).length;
  const activeCompoundTotal = compoundBreakdown.reduce(
    (total, entry) => total + entry.count,
    0,
  );
  const topSpeedReference = sessionBenchmarks.topSpeed?.numericValue ?? 0;
  const replayTrackStatus = !hasPositionFrames
    ? "No stored track frames"
    : replayWindowQuery.isLoading
      ? "Loading track window"
      : replayWindowQuery.isError
        ? "Track window error"
        : replayRenderableTrackPositions.length === 0
          ? "No frames in replay window"
          : `${replayRenderableTrackPositions.length} drivers positioned`;
  const replayStartMs = replayTimelineTimes[0] ?? 0;
  const replayEndMs = replayTimelineTimes[replayTimelineTimes.length - 1] ?? 0;
  const replayDurationMs = Math.max(replayEndMs - replayStartMs, 0);
  const replayElapsedMs = Math.max(replayCurrentMs - replayStartMs, 0);
  const hasMaterializedReplay = replayChunks.length > 0;
  const hasReplayTransport = replayTimelineTimes.length > 1;
  const hasReplayFrameData =
    hasReplayTransport ||
    replayTimelineFramesQuery.isSuccess ||
    replayTrackPositions.length > 0;
  const replayFramePayloadPreview = replayTrackPositions.map((frame) => ({
    driverNumber: frame.driverNumber,
    emittedAt: frame.emittedAt,
    position: frame.position,
    x: frame.x,
    y: frame.y,
    z: frame.z,
  }));
  const replayControls = hasReplayTransport
    ? {
        activeTimestampLabel: activeReplayEvent
          ? formatDate(activeReplayEvent.emittedAt)
          : "--",
        elapsedLabel: formatReplayDuration(replayElapsedMs),
        durationLabel: formatReplayDuration(replayDurationMs),
        rangeMax: replayDurationMs,
        rangeValue: replayElapsedMs,
        rangeStartLabel: replayStartMs
          ? formatDate(new Date(replayStartMs).toISOString())
          : "--",
        rangeEndLabel: replayEndMs
          ? formatDate(new Date(replayEndMs).toISOString())
          : "--",
        isPlaying: isReplayPlaying,
        canStepBackward: replayIndex > 0,
        canStepForward: replayIndex < replayTimelineTimes.length - 1,
        onStepBackward: () =>
          activateReplayAtIndex(Math.max(replayIndex - 1, 0)),
        onTogglePlay: () => {
          setIsTrackReplayEnabled(true);
          setIsReplayPlaying((current) => !current);
        },
        onStepForward: () =>
          activateReplayAtIndex(
            Math.min(replayIndex + 1, replayTimelineTimes.length - 1),
          ),
        onSeek: (value: number) => seekReplayToTimestamp(replayStartMs + value),
        onJumpBack: () => seekReplayToTimestamp(replayCurrentMs - 15_000),
        onJumpForward: () => seekReplayToTimestamp(replayCurrentMs + 15_000),
      }
    : null;

  useEffect(() => {
    setReplayIndex(0);
    setIsReplayPlaying(false);
    setIsTrackReplayEnabled(false);
  }, [replayTimelineTimes]);

  useEffect(() => {
    if (replayRenderableTrackPositions.length > 0) {
      setStableReplayTrackPositions(replayRenderableTrackPositions);
    }
  }, [replayRenderableTrackPositions]);

  useEffect(() => {
    if (!isTrackReplayActive) {
      setStableReplayTrackPositions([]);
    }
  }, [isTrackReplayActive]);

  useEffect(() => {
    if (!isReplayPlaying || replayTimelineTimes.length <= 1) {
      return;
    }

    if (replayIndex >= replayTimelineTimes.length - 1) {
      setIsReplayPlaying(false);
      return;
    }

    const currentTime = replayTimelineTimes[replayIndex];
    const nextTime = replayTimelineTimes[replayIndex + 1];
    let delayMs = 380;

    if (currentTime && nextTime) {
      const eventGapMs = nextTime - currentTime;

      if (Number.isFinite(eventGapMs) && eventGapMs > 0) {
        delayMs = Math.min(900, Math.max(140, eventGapMs));
      }
    }

    const timer = window.setTimeout(() => {
      setReplayIndex((current) =>
        Math.min(current + 1, replayTimelineTimes.length - 1),
      );
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [isReplayPlaying, replayIndex, replayTimelineTimes]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--accent-soft),transparent_28%),linear-gradient(180deg,var(--background),var(--background-elevated))]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 md:px-10 md:py-14">
        <div className="flex items-center justify-between gap-4">
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="size-4" />
              Back to catalog
            </Link>
          </Button>
          <div className="text-sm text-[var(--muted-foreground)]">
            Session {sessionKey}
          </div>
        </div>

        {summaryQuery.isLoading ? (
          <Card className="min-h-56 animate-pulse bg-[var(--panel)]" />
        ) : summaryQuery.isError || !summary ? (
          <Card className="border-[var(--destructive)]/30">
            <CardHeader>
              <CardTitle>Summary unavailable</CardTitle>
              <CardDescription>
                {summaryQuery.error instanceof Error
                  ? summaryQuery.error.message
                  : "Unexpected summary error"}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <Card className="overflow-hidden border-[color-mix(in_oklab,var(--border),var(--primary)_20%)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--panel),white_4%),var(--panel-elevated))]">
              <CardHeader className="gap-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <CardDescription>
                      {summary.session.sessionType}
                    </CardDescription>
                    <CardTitle className="text-3xl tracking-[-0.03em] md:text-5xl">
                      {summary.session.sessionName ??
                        summary.session.sessionType}
                    </CardTitle>
                  </div>
                  <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-foreground)]">
                    {summary.status}
                  </span>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="rounded-(--radius-md) border border-[var(--border)] bg-[color-mix(in_oklab,var(--panel),white_16%)] px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                      Session clock
                    </div>
                    <div className="mt-1 text-lg font-semibold">
                      {sessionState?.clock ?? "00:00:00"}
                    </div>
                  </div>
                  <div className="rounded-(--radius-md) border border-[var(--border)] bg-[color-mix(in_oklab,var(--panel),white_16%)] px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                      Track status
                    </div>
                    <div className="mt-1 text-lg font-semibold">
                      {sessionState?.trackMessage ??
                        sessionState?.trackStatus ??
                        "Unknown"}
                    </div>
                  </div>
                  <div className="rounded-(--radius-md) border border-[var(--border)] bg-[color-mix(in_oklab,var(--panel),white_16%)] px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                      Weather
                    </div>
                    <div className="mt-1 text-lg font-semibold">
                      {weather?.airTemp ? `${weather.airTemp}C` : "Unavailable"}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]">
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1">
                    <Flag className="size-3.5" />
                    Season {summary.session.season}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1">
                    <TimerReset className="size-3.5" />
                    Updated {formatDate(summary.updatedAt)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel)] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    Drivers
                  </div>
                  <div className="mt-2 text-3xl font-semibold">
                    {summary.driverCount}
                  </div>
                </div>
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel)] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    Last sequence
                  </div>
                  <div className="mt-2 text-3xl font-semibold">
                    {summary.lastSequence}
                  </div>
                </div>
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel)] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    Meeting key
                  </div>
                  <div className="mt-2 text-3xl font-semibold">
                    {summary.session.meetingKey}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[var(--panel)]/95">
              <CardHeader>
                <CardTitle>Bootstrap and live stream</CardTitle>
                <CardDescription>
                  The page now reads boot snapshots and recent stream frames
                  from Tinybird.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-[var(--muted-foreground)]">
                {bootQuery.isLoading || liveWindowQuery.isLoading ? (
                  <div className="space-y-2">
                    <div className="h-18 animate-pulse rounded-(--radius-md) bg-[var(--muted)]" />
                    <div className="h-18 animate-pulse rounded-(--radius-md) bg-[var(--muted)]" />
                  </div>
                ) : bootQuery.isError || liveWindowQuery.isError ? (
                  <p className="text-[var(--destructive)]">
                    {bootQuery.error instanceof Error
                      ? bootQuery.error.message
                      : liveWindowQuery.error instanceof Error
                        ? liveWindowQuery.error.message
                        : "Unexpected live bootstrap error"}
                  </p>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                          Boot snapshot
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                          {bootTopicCount} topics
                        </div>
                        <div className="mt-1 text-xs">
                          Captured{" "}
                          {boot
                            ? formatDate(boot.generatedAt)
                            : "not available"}
                        </div>
                      </div>
                      <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                          Stream cursor
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                          {latestEnvelope?.sequence ??
                            summary?.lastSequence ??
                            0}
                        </div>
                        <div className="mt-1 text-xs">
                          Latest topic{" "}
                          {latestEnvelope?.topic ?? "not available"}
                        </div>
                      </div>
                    </div>

                    {liveWindow.length === 0 ? (
                      <p>
                        No live envelopes have been read for this session yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {liveWindow.map((envelope) => (
                          <div
                            key={envelope.id}
                            className="flex items-center justify-between gap-3 rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] px-3 py-2"
                          >
                            <div className="inline-flex items-center gap-2 text-[var(--foreground)]">
                              <Waves className="size-4 text-[var(--primary)]" />
                              <span className="font-medium">
                                {envelope.topic}
                              </span>
                              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[var(--accent-foreground)]">
                                {envelope.mode}
                              </span>
                            </div>
                            <div className="text-right text-xs">
                              <div>#{envelope.sequence}</div>
                              <div>{formatDate(envelope.emittedAt)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        <TrackSurface
          model={trackSurfaceModel}
          replayControls={replayControls}
        />

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="overflow-hidden bg-[linear-gradient(180deg,color-mix(in_oklab,var(--panel),white_3%),var(--panel-elevated))]">
            <CardHeader>
              <CardTitle>Race snapshot</CardTitle>
              <CardDescription>
                Derived from the Tinybird boot snapshot for instant historical
                load.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {bootQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-14 animate-pulse rounded-(--radius-md) bg-[var(--muted)]"
                    />
                  ))}
                </div>
              ) : topDrivers.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Driver timing data is not available in the current snapshot.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    {topDrivers.map((driver, index) => (
                      <div
                        key={`podium-${driver.racingNumber}`}
                        className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel)] p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div
                            className="flex size-10 items-center justify-center rounded-full text-sm font-semibold text-white"
                            style={{ backgroundColor: `#${driver.teamColor}` }}
                          >
                            P{driver.position}
                          </div>
                          <div className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                            <Medal className="size-3.5" />
                            {index === 0 ? "Leader" : "Podium"}
                          </div>
                        </div>
                        <div className="mt-4 text-lg font-semibold">
                          {driver.name}
                        </div>
                        <div className="text-sm text-[var(--muted-foreground)]">
                          {driver.teamName}
                        </div>
                        <div className="mt-4 flex items-center justify-between text-sm">
                          <span className="text-[var(--muted-foreground)]">
                            Gap
                          </span>
                          <span className="font-medium">
                            {driver.position === 1
                              ? "Leader"
                              : (driver.gapToLeader ??
                                driver.intervalToAhead ??
                                "-")}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-sm">
                          <span className="text-[var(--muted-foreground)]">
                            Best
                          </span>
                          <span className="font-medium">
                            {driver.bestLapTime ?? "--"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-hidden rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel)]">
                    <div className="grid grid-cols-[72px_1.3fr_0.9fr_0.8fr_0.8fr_0.6fr] gap-3 border-b border-[var(--border)] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                      <div>Pos</div>
                      <div>Driver</div>
                      <div>Gap</div>
                      <div>Last lap</div>
                      <div>Best lap</div>
                      <div>Pits</div>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                      {leaderboard.map((driver) => (
                        <div
                          key={driver.racingNumber}
                          className="grid grid-cols-[72px_1.3fr_0.9fr_0.8fr_0.8fr_0.6fr] items-center gap-3 px-4 py-3"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                              style={{
                                backgroundColor: `#${driver.teamColor}`,
                              }}
                            >
                              {driver.position}
                            </div>
                            {driver.inPit ||
                            driver.retired ||
                            driver.stopped ? (
                              <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                                {driver.retired
                                  ? "Out"
                                  : driver.inPit
                                    ? "Pit"
                                    : "Stopped"}
                              </span>
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-[var(--foreground)]">
                              {driver.name}
                            </div>
                            <div className="truncate text-xs text-[var(--muted-foreground)]">
                              #{driver.racingNumber} {driver.teamName}
                            </div>
                          </div>
                          <div className="text-sm text-[var(--foreground)]">
                            {driver.position === 1
                              ? "Leader"
                              : (driver.gapToLeader ??
                                driver.intervalToAhead ??
                                "-")}
                          </div>
                          <div className="text-sm text-[var(--muted-foreground)]">
                            {driver.lastLapTime ?? "--"}
                          </div>
                          <div className="text-sm text-[var(--muted-foreground)]">
                            {driver.bestLapTime ?? "--"}
                          </div>
                          <div className="text-sm text-[var(--foreground)]">
                            {driver.numberOfPitStops ?? 0}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4">
            <Card className="bg-[var(--panel)]/95">
              <CardHeader>
                <CardTitle>Conditions</CardTitle>
                <CardDescription>
                  Snapshot context for the selected session.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                  <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    <Thermometer className="size-3.5" />
                    Track temp
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {weather?.trackTemp ? `${weather.trackTemp}C` : "--"}
                  </div>
                </div>
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                  <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    <CloudSun className="size-3.5" />
                    Air temp
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {weather?.airTemp ? `${weather.airTemp}C` : "--"}
                  </div>
                </div>
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    Humidity
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {weather?.humidity ? `${weather.humidity}%` : "--"}
                  </div>
                </div>
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                  <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    <Wind className="size-3.5" />
                    Wind
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {weather?.windSpeed ? `${weather.windSpeed} m/s` : "--"}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[var(--panel)]/95">
              <CardHeader>
                <CardTitle>Session pulse</CardTitle>
                <CardDescription>
                  High-value summary metrics from the current stored session
                  state.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                  <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    <Milestone className="size-3.5" />
                    Session status
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {sessionState?.sessionStatus ?? summary?.status ?? "--"}
                  </div>
                </div>
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    Boot topics
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {bootTopicCount}
                  </div>
                </div>
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    Race control
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {raceControl.length}
                  </div>
                </div>
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    Replay chunks
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {replayChunks.length}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="bg-[var(--panel)]/95">
            <CardHeader>
              <CardTitle>Field telemetry</CardTitle>
              <CardDescription>
                Driver state and tyre strategy pulled from the stored boot
                snapshot.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    Running
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {driverStatusBreakdown.running}
                  </div>
                </div>
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    In pit
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {driverStatusBreakdown.inPit}
                  </div>
                </div>
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    Retired
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {driverStatusBreakdown.retired}
                  </div>
                </div>
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    Stopped
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {driverStatusBreakdown.stopped}
                  </div>
                </div>
              </div>

              <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                      Compound spread
                    </div>
                    <div className="mt-1 text-sm text-[var(--muted-foreground)]">
                      Active compounds across {activeCompoundTotal} stored stint
                      rows.
                    </div>
                  </div>
                  <FlagTriangleRight className="size-4 text-[var(--primary)]" />
                </div>
                {compoundBreakdown.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                    Compound data is not available yet.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {compoundBreakdown.map((entry) => {
                      const width =
                        activeCompoundTotal > 0
                          ? `${Math.max(
                              10,
                              Math.round(
                                (entry.count / activeCompoundTotal) * 100,
                              ),
                            )}%`
                          : "10%";

                      return (
                        <div key={entry.compound} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-medium">
                              {entry.compound}
                            </span>
                            <span className="text-[var(--muted-foreground)]">
                              {entry.count}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-[var(--panel)]">
                            <div
                              className="h-2 rounded-full bg-[var(--primary)]"
                              style={{ width }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[var(--panel)]/95">
            <CardHeader>
              <CardTitle>Signal coverage</CardTitle>
              <CardDescription>
                Stored topic health and recent Tinybird-served activity for this
                session.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                    <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                      <RadioTower className="size-3.5" />
                      Critical topics
                    </div>
                    <div className="mt-2 text-2xl font-semibold">
                      {bootCoverageCount}/{bootTopicCoverage.length}
                    </div>
                  </div>
                  <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                    <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                      <Waves className="size-3.5" />
                      Recent frames
                    </div>
                    <div className="mt-2 text-2xl font-semibold">
                      {liveWindow.length}
                    </div>
                  </div>
                </div>

                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    Boot coverage
                  </div>
                  <div className="mt-3 space-y-2">
                    {bootTopicCoverage.map((entry) => (
                      <div
                        key={entry.key}
                        className="flex items-center justify-between gap-3 rounded-(--radius-sm) bg-[var(--panel)] px-3 py-2 text-sm"
                      >
                        <span>{entry.label}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${
                            entry.available
                              ? "bg-[var(--accent-soft)] text-[var(--accent-foreground)]"
                              : "bg-[var(--muted)] text-[var(--muted-foreground)]"
                          }`}
                        >
                          {entry.available ? "present" : "missing"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    Recent signal lane
                  </div>
                  {recentSignalBursts.length === 0 ? (
                    <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                      No recent live envelopes are available for this session.
                    </p>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {recentSignalBursts.map((envelope) => (
                        <button
                          key={envelope.id}
                          type="button"
                          onClick={() => {
                            const nextIndex = replayEvents.findIndex(
                              (event) => event.id === envelope.id,
                            );

                            if (nextIndex >= 0) {
                              seekReplayToTimestamp(
                                Date.parse(envelope.emittedAt),
                              );
                            }
                          }}
                          className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-left text-xs transition-colors hover:border-[var(--primary)] hover:bg-[color-mix(in_oklab,var(--panel),white_6%)]"
                        >
                          <div className="font-medium uppercase tracking-[0.14em] text-[var(--foreground)]">
                            {envelope.topic}
                          </div>
                          <div className="mt-1 text-[var(--muted-foreground)]">
                            #{envelope.sequence}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    Materialized replay topics
                  </div>
                  {replayTopicBreakdown.length === 0 ? (
                    <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                      Replay chunks are not available yet.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-2">
                      {replayTopicBreakdown
                        .slice(0, 6)
                        .map(([topic, count]) => (
                          <div
                            key={`signal-${topic}`}
                            className="flex items-center justify-between gap-3 rounded-(--radius-sm) bg-[var(--panel)] px-3 py-2 text-sm"
                          >
                            <span className="font-medium">{topic}</span>
                            <span className="text-[var(--muted-foreground)]">
                              {count} frames
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Card className="bg-[var(--panel)]/95">
          <CardHeader>
            <CardTitle>Race Intelligence</CardTitle>
            <CardDescription>
              Switch between stored session views without changing the backend
              contract.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {[
                { id: "standings", label: "Standings" },
                { id: "stints", label: "Stints" },
                { id: "control", label: "Race control" },
                { id: "replay", label: "Replay" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() =>
                    setIntelligenceView(
                      tab.id as "standings" | "stints" | "control" | "replay",
                    )
                  }
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors ${
                    intelligenceView === tab.id
                      ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                      : "border-[var(--border)] bg-[var(--panel-elevated)] text-[var(--foreground)] hover:bg-[var(--muted)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {intelligenceView === "standings" ? (
              <div className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-5">
                  <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4 lg:col-span-2">
                    <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                      Fastest lap benchmark
                    </div>
                    <div className="mt-2 text-lg font-semibold">
                      {sessionBenchmarks.fastestLap?.value ?? "--"}
                    </div>
                    <div className="mt-1 text-sm text-[var(--muted-foreground)]">
                      {sessionBenchmarks.fastestLap
                        ? `${sessionBenchmarks.fastestLap.driverName} • #${sessionBenchmarks.fastestLap.racingNumber}`
                        : "No fastest lap stored"}
                    </div>
                  </div>
                  <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                      Speed trap
                    </div>
                    <div className="mt-2 text-lg font-semibold">
                      {sessionBenchmarks.topSpeed?.value ?? "--"}
                    </div>
                    <div className="mt-1 text-sm text-[var(--muted-foreground)]">
                      {sessionBenchmarks.topSpeed?.driverName ??
                        "No speed data"}
                    </div>
                  </div>
                  {sessionBenchmarks.sectorLeaders.map(
                    (sectorLeader, index) => (
                      <div
                        key={`sector-benchmark-${index + 1}`}
                        className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4"
                      >
                        <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                          Sector {index + 1}
                        </div>
                        <div className="mt-2 text-lg font-semibold">
                          {sectorLeader?.value ?? "--"}
                        </div>
                        <div className="mt-1 text-sm text-[var(--muted-foreground)]">
                          {sectorLeader?.driverName ?? "No benchmark"}
                        </div>
                      </div>
                    ),
                  )}
                </div>

                <div className="overflow-x-auto rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)]">
                  <div className="grid min-w-[1040px] grid-cols-[72px_1.3fr_0.9fr_1.4fr_0.9fr_0.8fr_0.8fr] gap-3 border-b border-[var(--border)] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    <div>Pos</div>
                    <div>Driver</div>
                    <div>Gap</div>
                    <div>Sector trace</div>
                    <div>Speed trap</div>
                    <div>Tyre</div>
                    <div>Status</div>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {leaderboard.slice(0, 12).map((driver) => {
                      const speedWidth =
                        driver.speedTrap && topSpeedReference > 0
                          ? `${Math.max(
                              10,
                              Math.round(
                                (driver.speedTrap / topSpeedReference) * 100,
                              ),
                            )}%`
                          : "0%";

                      return (
                        <div
                          key={`intel-${driver.racingNumber}`}
                          className="grid min-w-[1040px] grid-cols-[72px_1.3fr_0.9fr_1.4fr_0.9fr_0.8fr_0.8fr] items-center gap-3 px-4 py-3"
                        >
                          <div className="font-medium">{driver.position}</div>
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {driver.name}
                            </div>
                            <div className="truncate text-xs text-[var(--muted-foreground)]">
                              #{driver.racingNumber} {driver.teamName}
                            </div>
                            <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                              Last {driver.lastLapTime ?? "--"} • Best{" "}
                              {driver.bestLapTime ?? "--"} • Laps{" "}
                              {driver.numberOfLaps ?? "--"}
                            </div>
                          </div>
                          <div className="text-sm text-[var(--muted-foreground)]">
                            {driver.position === 1
                              ? "Leader"
                              : (driver.gapToLeader ??
                                driver.intervalToAhead ??
                                "-")}
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {driver.sectors.length === 0 ? (
                              <div className="col-span-3 text-sm text-[var(--muted-foreground)]">
                                No sector data
                              </div>
                            ) : (
                              driver.sectors
                                .slice(0, 3)
                                .map((sector, index) => (
                                  <div
                                    key={`${driver.racingNumber}-sector-${index + 1}`}
                                    className={`rounded-(--radius-sm) border px-2 py-2 ${getSectorTone(
                                      sector.overallFastest,
                                      sector.personalFastest,
                                    )}`}
                                  >
                                    <div className="text-[10px] uppercase tracking-[0.16em] opacity-80">
                                      S{index + 1}
                                    </div>
                                    <div className="mt-1 text-sm font-medium">
                                      {sector.value ||
                                        (sector.stopped ? "Stop" : "--")}
                                    </div>
                                  </div>
                                ))
                            )}
                          </div>
                          <div className="space-y-2">
                            <div className="text-sm font-medium">
                              {driver.speedTrap
                                ? `${driver.speedTrap} km/h`
                                : "--"}
                            </div>
                            <div className="h-1.5 rounded-full bg-[var(--panel)]">
                              <div
                                className="h-1.5 rounded-full bg-[var(--primary)]"
                                style={{ width: speedWidth }}
                              />
                            </div>
                          </div>
                          <div className="text-sm text-[var(--foreground)]">
                            {driver.currentCompound ?? "--"}
                          </div>
                          <div className="text-sm text-[var(--muted-foreground)]">
                            {driver.retired
                              ? "Retired"
                              : driver.inPit
                                ? "In pit"
                                : driver.stopped
                                  ? "Stopped"
                                  : "Running"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {intelligenceView === "stints" ? (
              stintOverview.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Stint data is not available in the current snapshot.
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {stintOverview.slice(0, 12).map((driver) => (
                    <div
                      key={`stint-${driver.racingNumber}`}
                      className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{driver.name}</div>
                          <div className="text-xs text-[var(--muted-foreground)]">
                            {driver.teamName}
                          </div>
                        </div>
                        <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                          {driver.currentCompound ?? "Unknown"}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-[var(--muted-foreground)]">
                            Stints
                          </div>
                          <div className="font-medium">
                            {driver.totalStints}
                          </div>
                        </div>
                        <div>
                          <div className="text-[var(--muted-foreground)]">
                            Current laps
                          </div>
                          <div className="font-medium">
                            {driver.lastStintLaps ?? "--"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[var(--muted-foreground)]">
                            Last lap
                          </div>
                          <div className="font-medium">
                            {driver.lastLapNumber ?? "--"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[var(--muted-foreground)]">
                            Grid
                          </div>
                          <div className="font-medium">
                            {driver.gridPos ?? "--"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : null}

            {intelligenceView === "control" ? (
              raceControlQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-18 animate-pulse rounded-(--radius-md) border border-[var(--border)] bg-[var(--muted)]"
                    />
                  ))}
                </div>
              ) : raceControlQuery.isError ? (
                <p className="text-sm text-[var(--destructive)]">
                  {raceControlQuery.error instanceof Error
                    ? raceControlQuery.error.message
                    : "Unexpected race control error"}
                </p>
              ) : raceControl.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  No race control messages have been ingested for this session
                  yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {raceControl.map((message) => (
                    <div
                      key={`${message.sessionKey}-${message.sequence}`}
                      className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{message.title}</div>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {formatDate(message.emittedAt)}
                        </div>
                      </div>
                      <div className="mt-1 text-sm text-[var(--muted-foreground)]">
                        {message.body}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : null}

            {intelligenceView === "replay" ? (
              replayQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-18 animate-pulse rounded-(--radius-md) border border-[var(--border)] bg-[var(--muted)]"
                    />
                  ))}
                </div>
              ) : replayQuery.isError ? (
                <p className="text-sm text-[var(--destructive)]">
                  {replayQuery.error instanceof Error
                    ? replayQuery.error.message
                    : "Unexpected replay error"}
                </p>
              ) : !hasMaterializedReplay && !hasReplayFrameData ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Replay data has not been materialized for this session yet.
                </p>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                      <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                        <Play className="size-3.5" />
                        {hasMaterializedReplay
                          ? "Visible chunks"
                          : "Replay source"}
                      </div>
                      <div className="mt-2 text-2xl font-semibold">
                        {hasMaterializedReplay
                          ? replayChunks.length
                          : "Track frames"}
                      </div>
                    </div>
                    <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                        {hasMaterializedReplay ? "First range" : "Start time"}
                      </div>
                      <div className="mt-2 text-sm font-medium">
                        {hasMaterializedReplay
                          ? firstReplay
                            ? `${firstReplay.rangeStartSequence}-${firstReplay.rangeEndSequence}`
                            : "n/a"
                          : replayStartMs
                            ? formatDate(new Date(replayStartMs).toISOString())
                            : "n/a"}
                      </div>
                    </div>
                    <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                        {hasMaterializedReplay ? "Last range" : "End time"}
                      </div>
                      <div className="mt-2 text-sm font-medium">
                        {hasMaterializedReplay
                          ? lastReplay
                            ? `${lastReplay.rangeStartSequence}-${lastReplay.rangeEndSequence}`
                            : "n/a"
                          : replayEndMs
                            ? formatDate(new Date(replayEndMs).toISOString())
                            : "n/a"}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="space-y-4 rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                            Replay player
                          </div>
                          <div className="mt-1 text-lg font-semibold">
                            Frame {replayIndex + 1} of{" "}
                            {replayTimelineTimes.length}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() =>
                              activateReplayAtIndex(
                                Math.max(replayIndex - 1, 0),
                              )
                            }
                            disabled={replayIndex === 0}
                          >
                            <SkipBack className="size-4" />
                          </Button>
                          <Button
                            variant="default"
                            onClick={() =>
                              setIsReplayPlaying((current) => !current)
                            }
                            disabled={replayTimelineTimes.length <= 1}
                          >
                            {isReplayPlaying ? (
                              <>
                                <Pause className="size-4" />
                                Pause
                              </>
                            ) : (
                              <>
                                <Play className="size-4" />
                                Play
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() =>
                              activateReplayAtIndex(
                                Math.min(
                                  replayIndex + 1,
                                  replayTimelineTimes.length - 1,
                                ),
                              )
                            }
                            disabled={
                              replayIndex >= replayTimelineTimes.length - 1
                            }
                          >
                            <SkipForward className="size-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel)] p-4">
                        <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                          <span>Timeline</span>
                          <span>
                            {formatReplayDuration(replayElapsedMs)} /{" "}
                            {formatReplayDuration(replayDurationMs)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(replayDurationMs, 0)}
                          step={100}
                          value={replayElapsedMs}
                          onChange={(event) =>
                            seekReplayToTimestamp(
                              replayStartMs +
                                Number.parseInt(event.target.value, 10),
                            )
                          }
                          className="w-full accent-[var(--primary)]"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]">
                          <span>
                            {replayStartMs
                              ? formatDate(
                                  new Date(replayStartMs).toISOString(),
                                )
                              : "--"}
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                seekReplayToTimestamp(replayCurrentMs - 15_000)
                              }
                              disabled={replayIndex === 0}
                            >
                              -15s
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                seekReplayToTimestamp(replayCurrentMs + 15_000)
                              }
                              disabled={
                                replayIndex >= replayTimelineTimes.length - 1
                              }
                            >
                              +15s
                            </Button>
                          </div>
                          <span>
                            {replayEndMs
                              ? formatDate(new Date(replayEndMs).toISOString())
                              : "--"}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel)] p-4">
                          <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                            Active topic
                          </div>
                          <div className="mt-2 text-lg font-semibold">
                            {hasMaterializedReplay
                              ? activeReplayEvent?.topic ?? "--"
                              : "position"}
                          </div>
                        </div>
                        <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel)] p-4">
                          <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                            {hasMaterializedReplay ? "Sequence" : "Drivers"}
                          </div>
                          <div className="mt-2 text-lg font-semibold">
                            {hasMaterializedReplay
                              ? activeReplayEvent?.sequence ?? "--"
                              : replayTrackPositions.length}
                          </div>
                        </div>
                        <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel)] p-4">
                          <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                            {hasMaterializedReplay ? "Mode" : "Source"}
                          </div>
                          <div className="mt-2 text-lg font-semibold">
                            {hasMaterializedReplay
                              ? activeReplayEvent?.mode ?? "--"
                              : "track-frame"}
                          </div>
                        </div>
                        <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel)] p-4">
                          <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                            Replay time
                          </div>
                          <div className="mt-2 text-sm font-semibold">
                            {activeReplayEvent
                              ? formatDate(activeReplayEvent.emittedAt)
                              : "--"}
                          </div>
                          <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                            {replayTrackStatus}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel)] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium">
                            {hasMaterializedReplay
                              ? "Current frame payload"
                              : "Current frame positions"}
                          </div>
                          <div className="text-xs text-[var(--muted-foreground)]">
                            {activeReplayEvent
                              ? formatDate(activeReplayEvent.emittedAt)
                              : replayCurrentMs
                                ? formatDate(new Date(replayCurrentMs).toISOString())
                                : "No frame"}
                          </div>
                        </div>
                        <pre className="mt-3 max-h-72 overflow-auto rounded-(--radius-sm) bg-[color-mix(in_oklab,var(--background),black_4%)] p-3 font-mono text-xs leading-6 text-[var(--foreground)]">
                          {activeReplayEvent
                            ? JSON.stringify(activeReplayEvent.payload, null, 2)
                            : replayFramePayloadPreview.length > 0
                              ? JSON.stringify(replayFramePayloadPreview, null, 2)
                              : "No replay frame selected."}
                        </pre>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                          Topic breakdown
                        </div>
                        {hasMaterializedReplay ? (
                          <div className="mt-3 space-y-2">
                            {replayTopicBreakdown.map(([topic, count]) => (
                              <div
                                key={topic}
                                className="flex items-center justify-between gap-3 rounded-(--radius-sm) bg-[var(--panel)] px-3 py-2 text-sm"
                              >
                                <span className="font-medium">{topic}</span>
                                <span className="text-[var(--muted-foreground)]">
                                  {count}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                            Replay is being driven from stored track frames for
                            this session. Materialized event chunks are not
                            available locally yet.
                          </p>
                        )}
                      </div>

                      <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                          Chunk map
                        </div>
                        {hasMaterializedReplay ? (
                          <div className="mt-3 space-y-2">
                            {replayChunks.map((chunk) => (
                              <div
                                key={`${chunk.sessionKey}-${chunk.chunkIndex}`}
                                className="flex items-center justify-between gap-3 rounded-(--radius-sm) bg-[var(--panel)] px-3 py-2 text-sm"
                              >
                                <div className="inline-flex items-center gap-3">
                                  <FlagTriangleRight className="size-4 text-[var(--primary)]" />
                                  <div>
                                    <div className="font-medium">
                                      Chunk {chunk.chunkIndex}
                                    </div>
                                    <div className="text-[var(--muted-foreground)]">
                                      {chunk.events.length} events
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right text-[var(--muted-foreground)]">
                                  <div>
                                    {chunk.rangeStartSequence}-
                                    {chunk.rangeEndSequence}
                                  </div>
                                  <div>{formatDate(chunk.emittedAt)}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                            Track-frame replay uses the stored frame timeline
                            directly, so there is no chunk map to show.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
