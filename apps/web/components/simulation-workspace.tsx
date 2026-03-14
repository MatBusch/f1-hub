"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Gauge,
  Layers3,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  TimerReset,
} from "lucide-react";

import {
  fetchReplayChunks,
  fetchSessionCatalogMeta,
  fetchSessionBoot,
  fetchSessionDrivers,
  fetchSessionSummary,
  fetchTrackOutline,
  fetchTrackPositionFrames,
  fetchTrackReplayFrame,
} from "@/lib/api";
import {
  getLeaderboard,
  getTrackSurfaceModelFromFrames,
} from "@/lib/session-insights";
import { ReplayTrackCanvas } from "@/components/replay-track-canvas";
import { ReplayTimingTable } from "@/components/replay-timing-table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2, 4] as const;

function hasCoordinates(frame: { x?: number | null; y?: number | null; z?: number | null }) {
  if (frame.x == null || frame.y == null) {
    return false;
  }

  return !(frame.x === 0 && frame.y === 0 && (frame.z ?? 0) === 0);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function getSessionStartTime(boot: Awaited<ReturnType<typeof fetchSessionBoot>> | undefined) {
  const sessionInfo = boot?.state?.SessionInfo;

  if (!sessionInfo || typeof sessionInfo !== "object") {
    return undefined;
  }

  const record = sessionInfo as Record<string, unknown>;
  const startDate = record.StartDate;
  const gmtOffset = record.GmtOffset;

  if (typeof startDate !== "string" || startDate.length === 0) {
    return undefined;
  }

  if (typeof gmtOffset !== "string" || !/^[-+]?\d{2}:\d{2}:\d{2}$/.test(gmtOffset)) {
    return startDate;
  }

  const match = gmtOffset.match(/^([+-]?)(\d{2}):(\d{2}):(\d{2})$/);

  if (!match) {
    return startDate;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[2] ?? "0", 10);
  const minutes = Number.parseInt(match[3] ?? "0", 10);
  const seconds = Number.parseInt(match[4] ?? "0", 10);
  const offsetMs = sign * (((hours * 60 + minutes) * 60 + seconds) * 1000);
  const localDate = new Date(`${startDate}${startDate.endsWith("Z") ? "" : "Z"}`);

  if (Number.isNaN(localDate.getTime())) {
    return startDate;
  }

  return new Date(localDate.getTime() - offsetMs).toISOString();
}

function nextIsoTimestamp(value: string) {
  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed + 1).toISOString();
}

function buildReplayBoot(
  boot: Awaited<ReturnType<typeof fetchSessionBoot>> | undefined,
  replayEvents: Awaited<ReturnType<typeof fetchReplayChunks>>["data"][number]["events"],
  currentEventTime: string | undefined,
) {
  if (!boot || !currentEventTime) {
    return boot;
  }

  const currentTime = Date.parse(currentEventTime);

  if (Number.isNaN(currentTime)) {
    return boot;
  }

  let latestTiming: unknown = undefined;
  let latestTimingApp: unknown = undefined;
  let latestTimingStats: unknown = undefined;
  let latestLapCount: unknown = undefined;
  let latestTrackStatus: unknown = undefined;

  for (const event of replayEvents) {
    const eventTime = Date.parse(event.emittedAt);

    if (!Number.isNaN(eventTime) && eventTime > currentTime) {
      break;
    }

    if (event.topic === "timing") {
      latestTiming = event.payload;
    } else if (event.topic === "timingApp") {
      latestTimingApp = event.payload;
    } else if (event.topic === "timingStats") {
      latestTimingStats = event.payload;
    } else if (event.topic === "lapCount") {
      latestLapCount = event.payload;
    } else if (event.topic === "trackStatus") {
      latestTrackStatus = event.payload;
    }
  }

  return {
    ...boot,
    state: {
      ...boot.state,
      ...(latestTiming !== undefined ? { TimingData: latestTiming } : {}),
      ...(latestTimingApp !== undefined ? { TimingAppData: latestTimingApp } : {}),
      ...(latestTimingStats !== undefined ? { TimingStats: latestTimingStats } : {}),
      ...(latestLapCount !== undefined ? { LapCount: latestLapCount } : {}),
      ...(latestTrackStatus !== undefined ? { TrackStatus: latestTrackStatus } : {}),
    },
  };
}

export function SimulationWorkspace({ sessionKey }: { sessionKey: number }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [frameProgress, setFrameProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string>("all");
  const [speedIndex, setSpeedIndex] = useState(1);
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  const [isExpanded, setIsExpanded] = useState(false);

  const summaryQuery = useQuery({
    queryKey: ["simulation", sessionKey, "summary"],
    queryFn: () => fetchSessionSummary(sessionKey),
    staleTime: 60_000,
  });
  const bootQuery = useQuery({
    queryKey: ["simulation", sessionKey, "boot"],
    queryFn: () => fetchSessionBoot(sessionKey),
    staleTime: 60_000,
  });
  const driversQuery = useQuery({
    queryKey: ["simulation", sessionKey, "drivers"],
    queryFn: () => fetchSessionDrivers(sessionKey),
    staleTime: 30 * 60_000,
  });
  const outlineQuery = useQuery({
    queryKey: ["simulation", sessionKey, "outline"],
    queryFn: () => fetchTrackOutline(sessionKey),
    staleTime: 30 * 60_000,
  });
  const catalogMetaQuery = useQuery({
    queryKey: ["simulation", sessionKey, "catalog-meta"],
    queryFn: () => fetchSessionCatalogMeta(sessionKey),
    staleTime: 60_000,
  });
  const sessionStartTime = useMemo(
    () => getSessionStartTime(bootQuery.data),
    [bootQuery.data],
  );
  const outlineDriverNumber = useMemo(
    () => driversQuery.data?.data?.[0]?.driverNumber,
    [driversQuery.data?.data],
  );
  const replayEndsAt = catalogMetaQuery.data?.lastFrameAt ?? undefined;
  const timelineFramesQuery = useInfiniteQuery({
    queryKey: [
      "simulation",
      sessionKey,
      "timeline-frames",
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

      if (rows.length < 25_000) {
        return undefined;
      }

      return nextIsoTimestamp(rows[rows.length - 1]!.emittedAt);
    },
    enabled: Boolean(sessionStartTime),
    staleTime: 30 * 60_000,
  });
  const outlineFramesQuery = useQuery({
    queryKey: [
      "simulation",
      sessionKey,
      "outline-frames",
      outlineDriverNumber ?? 0,
      sessionStartTime ?? "unknown",
    ],
    queryFn: () =>
      fetchTrackPositionFrames(sessionKey, {
        driverNumber: outlineDriverNumber,
        fromTime: sessionStartTime,
        limit: 6_000,
      }),
    enabled: Boolean(sessionStartTime) && outlineDriverNumber !== undefined,
    staleTime: 30 * 60_000,
  });
  const replayQuery = useInfiniteQuery({
    queryKey: ["simulation", sessionKey, "replay"],
    queryFn: ({ pageParam }) => fetchReplayChunks(sessionKey, pageParam, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (lastPage.data.length === 0) {
        return undefined;
      }

      return lastPage.data[lastPage.data.length - 1]!.chunkIndex + 1;
    },
    staleTime: 30 * 60_000,
  });

  const replayEvents = useMemo(
    () =>
      replayQuery.data?.pages
        .flatMap((page) => page.data)
        .flatMap((chunk) => chunk.events)
        .sort((left, right) => left.sequence - right.sequence) ?? [],
    [replayQuery.data?.pages],
  );
  const timelineFrameRows = useMemo(
    () => timelineFramesQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [timelineFramesQuery.data?.pages],
  );
  const trackTimelineEvents = useMemo(() => {
    const grouped = new Map<string, { count: number; withCoordinates: number }>();

    for (const frame of timelineFrameRows) {
      const current = grouped.get(frame.emittedAt) ?? { count: 0, withCoordinates: 0 };
      current.count += 1;
      if (hasCoordinates(frame)) {
        current.withCoordinates += 1;
      }
      grouped.set(frame.emittedAt, current);
    }

    return [...grouped.entries()]
      .filter(([, summary]) => summary.withCoordinates >= 5)
      .map(([emittedAt], index) => ({
        id: `track-${index}`,
        sessionKey,
        sequence: index + 1,
        emittedAt,
        receivedAt: emittedAt,
        mode: "timeline",
        topic: "trackPosition",
        payload: null,
      }));
  }, [sessionKey, timelineFrameRows]);
  const trackTimelineFrameMap = useMemo(() => {
    const grouped = new Map<string, Awaited<ReturnType<typeof fetchTrackPositionFrames>>["data"]>();

    for (const frame of timelineFrameRows) {
      if (!hasCoordinates(frame)) {
        continue;
      }

      const current = grouped.get(frame.emittedAt) ?? [];
      current.push(frame);
      grouped.set(frame.emittedAt, current);
    }

    return grouped;
  }, [timelineFrameRows]);
  const usingTrackTimeline = trackTimelineEvents.length > 0;
  const sourceEvents = usingTrackTimeline ? trackTimelineEvents : replayEvents;
  const totalTimelineRowsEstimate = catalogMetaQuery.data?.frameCount ?? 0;
  const loadedTimelineRows = timelineFrameRows.length;
  const loadedTimelineRatio =
    totalTimelineRowsEstimate > 0
      ? Math.min(1, loadedTimelineRows / totalTimelineRowsEstimate)
      : 0;
  const loadedTimelineEventRatio =
    sourceEvents.length > 0 ? currentIndex / Math.max(sourceEvents.length - 1, 1) : 0;
  const topicCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const event of sourceEvents) {
      counts.set(event.topic, (counts.get(event.topic) ?? 0) + 1);
    }

    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [sourceEvents]);
  const filteredReplayEvents = useMemo(
    () =>
      selectedTopic === "all"
        ? sourceEvents
        : sourceEvents.filter((event) => event.topic === selectedTopic),
    [sourceEvents, selectedTopic],
  );
  const estimatedTotalReplayEvents =
    usingTrackTimeline && loadedTimelineRatio > 0
      ? Math.max(filteredReplayEvents.length, Math.round(filteredReplayEvents.length / loadedTimelineRatio))
      : filteredReplayEvents.length;
  const currentEvent = filteredReplayEvents[currentIndex] ?? null;
  const nextEvent = filteredReplayEvents[Math.min(currentIndex + 1, filteredReplayEvents.length - 1)] ?? null;
  const playbackSpeed = PLAYBACK_SPEEDS[speedIndex] ?? 1;
  const replayBoot = useMemo(
    () => buildReplayBoot(bootQuery.data, replayEvents, currentEvent?.emittedAt),
    [bootQuery.data, currentEvent?.emittedAt, replayEvents],
  );
  const leaderboard = useMemo(() => getLeaderboard(replayBoot), [replayBoot]);
  const timelineDisplayFrames = currentEvent
    ? trackTimelineFrameMap.get(currentEvent.emittedAt) ?? []
    : [];

  const replayFrameQuery = useQuery({
    queryKey: ["simulation", sessionKey, "frame", currentEvent?.emittedAt ?? "none"],
    queryFn: () => fetchTrackReplayFrame(sessionKey, currentEvent!.emittedAt, 2000),
    enabled: currentEvent !== null && !usingTrackTimeline,
    staleTime: 1_000,
    placeholderData: (previousData) => previousData,
  });

  const trackSurfaceModel = useMemo(
    () => {
      return getTrackSurfaceModelFromFrames({
        boot: bootQuery.data,
        displayPositions: usingTrackTimeline
          ? timelineDisplayFrames
          : (replayFrameQuery.data?.data ?? []),
        sessionDrivers: driversQuery.data?.data ?? [],
        outlinePoints: outlineQuery.data?.data ?? [],
        outlineFrames: outlineFramesQuery.data?.data ?? [],
      });
    },
    [
      bootQuery.data,
      driversQuery.data?.data,
      outlineFramesQuery.data?.data,
      outlineQuery.data?.data,
      replayFrameQuery.data?.data,
      timelineDisplayFrames,
      usingTrackTimeline,
    ],
  );
  const nextTrackSurfaceModel = useMemo(
    () => {
      if (!nextEvent) {
        return null;
      }

      const nextFrames = usingTrackTimeline
        ? trackTimelineFrameMap.get(nextEvent.emittedAt) ?? []
        : [];

      return getTrackSurfaceModelFromFrames({
        boot: bootQuery.data,
        displayPositions: nextFrames,
        sessionDrivers: driversQuery.data?.data ?? [],
        outlinePoints: outlineQuery.data?.data ?? [],
        outlineFrames: outlineFramesQuery.data?.data ?? [],
      });
    },
    [
      bootQuery.data,
      driversQuery.data?.data,
      nextEvent,
      outlineFramesQuery.data?.data,
      outlineQuery.data?.data,
      trackTimelineFrameMap,
      usingTrackTimeline,
    ],
  );
  const [retainedTrackSurfaceModel, setRetainedTrackSurfaceModel] = useState(trackSurfaceModel);
  const [retainedNextTrackSurfaceModel, setRetainedNextTrackSurfaceModel] = useState(nextTrackSurfaceModel);

  useEffect(() => {
    if (trackSurfaceModel) {
      setRetainedTrackSurfaceModel(trackSurfaceModel);
    }
  }, [trackSurfaceModel]);

  useEffect(() => {
    if (nextTrackSurfaceModel) {
      setRetainedNextTrackSurfaceModel(nextTrackSurfaceModel);
    }
  }, [nextTrackSurfaceModel]);

  useEffect(() => {
    setRetainedTrackSurfaceModel(null);
    setRetainedNextTrackSurfaceModel(null);
  }, [sessionKey]);

  const replayTimingRows = useMemo(() => {
    const markerSource = retainedTrackSurfaceModel ?? trackSurfaceModel;

    if (!markerSource?.markers?.length) {
      return leaderboard;
    }

    const leaderboardByNumber = new Map(
      leaderboard.map((entry) => [entry.racingNumber, entry] as const),
    );

    return markerSource.markers
      .map((marker) => {
        const existing = leaderboardByNumber.get(marker.racingNumber);

        if (!existing) {
          return {
            ...marker,
            gapToLeader: marker.position === 1 ? "Leader" : undefined,
            intervalToAhead: undefined,
            lastLapTime: "-",
            bestLapTime: "-",
            replayLap: marker.numberOfLaps,
            replayStatus: "Running",
            sectors: [],
          };
        }

        const replayStatus = existing.retired
          ? "Retired"
          : existing.stopped
            ? "Stopped"
            : existing.inPit
              ? "Pit"
              : "Running";

        return {
          ...existing,
          position: marker.position,
          name: marker.name,
          shortCode: marker.shortCode,
          teamName: marker.teamName,
          teamColor: marker.teamColor,
          headshotUrl: marker.headshotUrl ?? existing.headshotUrl,
          currentCompound: marker.currentCompound ?? existing.currentCompound,
          numberOfLaps: marker.numberOfLaps ?? existing.numberOfLaps,
          gapToLeader: existing.gapToLeader,
          intervalToAhead: existing.intervalToAhead,
          progress: marker.progress,
          replayLap: marker.numberOfLaps ?? existing.numberOfLaps,
          replayStatus,
        };
      })
      .sort((left, right) => left.position - right.position);
  }, [leaderboard, retainedTrackSurfaceModel, trackSurfaceModel]);

  const replayCanvasLoading =
    bootQuery.isLoading ||
    driversQuery.isLoading ||
    outlineQuery.isLoading ||
    catalogMetaQuery.isLoading ||
    outlineFramesQuery.isLoading ||
    timelineFramesQuery.isLoading ||
    replayFrameQuery.isLoading;

  useEffect(() => {
    if (!isPlaying || filteredReplayEvents.length <= 1) {
      return;
    }

    let frameId = 0;
    let lastTick = performance.now();

    const tick = (now: number) => {
      const deltaMs = now - lastTick;
      lastTick = now;

      setFrameProgress((currentProgress) => {
        const currentTimestamp = Date.parse(filteredReplayEvents[currentIndex]?.emittedAt ?? "");
        const nextTimestamp = Date.parse(
          filteredReplayEvents[Math.min(currentIndex + 1, filteredReplayEvents.length - 1)]?.emittedAt ?? "",
        );
        const durationMs = Math.max(nextTimestamp - currentTimestamp, 120);
        const nextProgress = currentProgress + (deltaMs * playbackSpeed) / durationMs;

        if (nextProgress >= 1) {
          setCurrentIndex((current) => {
            if (current >= filteredReplayEvents.length - 2) {
              if (
                (usingTrackTimeline && timelineFramesQuery.hasNextPage) ||
                replayQuery.hasNextPage
              ) {
                if (usingTrackTimeline && timelineFramesQuery.hasNextPage && !timelineFramesQuery.isFetchingNextPage) {
                  void timelineFramesQuery.fetchNextPage();
                }
                if (replayQuery.hasNextPage && !replayQuery.isFetchingNextPage) {
                  void replayQuery.fetchNextPage();
                }
                return current;
              }
              setIsPlaying(false);
              return current;
            }

            return current + 1;
          });
          return nextProgress - 1;
        }

        return nextProgress;
      });

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [currentIndex, filteredReplayEvents, isPlaying, playbackSpeed, replayQuery.fetchNextPage, replayQuery.hasNextPage, replayQuery.isFetchingNextPage, timelineFramesQuery.fetchNextPage, timelineFramesQuery.hasNextPage, timelineFramesQuery.isFetchingNextPage, usingTrackTimeline]);

  useEffect(() => {
    if (
      usingTrackTimeline &&
      timelineFramesQuery.hasNextPage &&
      !timelineFramesQuery.isFetchingNextPage &&
      (timelineFramesQuery.data?.pages.length ?? 0) < 4
    ) {
      void timelineFramesQuery.fetchNextPage();
    }
  }, [
    timelineFramesQuery.data?.pages.length,
    timelineFramesQuery.fetchNextPage,
    timelineFramesQuery.hasNextPage,
    timelineFramesQuery.isFetchingNextPage,
    usingTrackTimeline,
  ]);

  useEffect(() => {
    if (
      filteredReplayEvents.length > 0 &&
      currentIndex >= filteredReplayEvents.length - 48
    ) {
      if (replayQuery.hasNextPage && !replayQuery.isFetchingNextPage) {
        void replayQuery.fetchNextPage();
      }

      if (usingTrackTimeline && timelineFramesQuery.hasNextPage && !timelineFramesQuery.isFetchingNextPage) {
        void timelineFramesQuery.fetchNextPage();
      }
    }
  }, [
    currentIndex,
    filteredReplayEvents.length,
    replayQuery.fetchNextPage,
    replayQuery.hasNextPage,
    replayQuery.isFetchingNextPage,
    timelineFramesQuery.fetchNextPage,
    timelineFramesQuery.hasNextPage,
    timelineFramesQuery.isFetchingNextPage,
    usingTrackTimeline,
  ]);

  useEffect(() => {
    setCurrentIndex(0);
    setIsPlaying(false);
    setSelectedTopic("all");
    setSpeedIndex(1);
    setViewMode("2d");
    setIsExpanded(false);
    setFrameProgress(0);
  }, [sessionKey]);

  useEffect(() => {
    setCurrentIndex(0);
    setIsPlaying(false);
    setFrameProgress(0);
  }, [selectedTopic]);

  const expandedSurface = isExpanded ? (
    <div className="fixed inset-0 z-[80] bg-[color-mix(in_oklab,var(--background),black_18%)]/96 p-4 md:p-8">
      <div className="mx-auto h-full max-w-7xl overflow-auto">
        <ReplayTrackCanvas model={retainedTrackSurfaceModel ?? trackSurfaceModel} nextModel={retainedNextTrackSurfaceModel ?? nextTrackSurfaceModel} interpolation={frameProgress} isLoading={replayCanvasLoading} viewMode={viewMode} />
      </div>
    </div>
  ) : null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--accent-soft),transparent_28%),linear-gradient(180deg,var(--background),var(--background-elevated))] pb-8">
      {expandedSurface}
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 md:px-8 md:py-10">
        <section className="grid gap-6 xl:grid-cols-[1.22fr_0.78fr]">
          <Card className="overflow-hidden border-[color-mix(in_oklab,var(--border),var(--primary)_18%)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--panel),white_4%),var(--panel-elevated))]">
            <CardHeader className="gap-5">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                Historical Simulation
              </div>
              <div className="space-y-3">
                <CardTitle className="text-4xl tracking-[-0.04em] md:text-6xl">
                  Replay-first session viewer with transport, expand, and 3D map mode.
                </CardTitle>
                <CardDescription className="max-w-3xl text-base leading-7 text-[var(--muted-foreground)]">
                  This screen is now built around the replay itself: a large track surface,
                  a persistent transport model, topic-aware filtering, speed control, and
                  a map presentation that can switch between flat and dramatic broadcast-style perspective.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <Link href={`/sessions/${sessionKey}`}>
                    <ArrowLeft className="size-4" />
                    Back to session
                  </Link>
                </Button>
                <Button type="button" onClick={() => setIsPlaying((current) => !current)} disabled={filteredReplayEvents.length === 0}>
                  {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                  {isPlaying ? "Pause replay" : "Play replay"}
                </Button>
              </div>
            </CardHeader>
          </Card>

          <Card className="bg-[var(--panel)]/95">
            <CardHeader>
              <CardTitle>Replay HUD</CardTitle>
              <CardDescription>Fast status read for the current replay cursor.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Loaded events</div>
                <div className="mt-2 text-3xl font-semibold">{replayEvents.length}</div>
              </div>
              <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Speed / view</div>
                <div className="mt-2 text-3xl font-semibold">{playbackSpeed}x / {viewMode.toUpperCase()}</div>
              </div>
              <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4 sm:col-span-2">
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Current replay cursor</div>
                <div className="mt-2 text-lg font-medium text-[var(--foreground)]">
                  {currentEvent ? `${currentEvent.topic} at ${formatDate(currentEvent.emittedAt)}` : "Waiting for replay chunks"}
                </div>
                <div className="mt-2 text-sm text-[var(--muted-foreground)]">
                  Source {usingTrackTimeline ? "track timeline" : "replay chunks"} / filter {selectedTopic === "all" ? "all topics" : selectedTopic} / sequence {currentEvent?.sequence ?? "-"}
                </div>
                {usingTrackTimeline ? (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                      <span>Replay buffer</span>
                      <span>{Math.round(loadedTimelineRatio * 100)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--muted)]">
                      <div
                        className="h-full bg-[var(--primary)] transition-[width] duration-300"
                        style={{ width: `${loadedTimelineRatio * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                      <span>{loadedTimelineRows.toLocaleString()} loaded</span>
                      <span>{totalTimelineRowsEstimate.toLocaleString()} estimated</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-6">
          <ReplayTrackCanvas model={retainedTrackSurfaceModel ?? trackSurfaceModel} nextModel={retainedNextTrackSurfaceModel ?? nextTrackSurfaceModel} interpolation={frameProgress} isLoading={replayCanvasLoading} viewMode={viewMode} />

          <Card className="bg-[var(--panel)]/95">
              <CardHeader>
                <CardTitle>Transport Bar</CardTitle>
                <CardDescription>Dash-style replay controls with chunk-safe scrubbing.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTopic("all")}
                    className={`rounded-full border px-3 py-2 text-sm transition-colors ${selectedTopic === "all" ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)] bg-[var(--panel-elevated)] text-[var(--foreground)] hover:bg-[var(--muted)]"}`}
                  >
                    All topics
                  </button>
                  {topicCounts.slice(0, 8).map(([topic, count]) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => setSelectedTopic(topic)}
                      className={`rounded-full border px-3 py-2 text-sm transition-colors ${selectedTopic === topic ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)] bg-[var(--panel-elevated)] text-[var(--foreground)] hover:bg-[var(--muted)]"}`}
                    >
                      {topic} {count}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" size="icon" onClick={() => setCurrentIndex((current) => Math.max(0, current - 1))} disabled={currentIndex === 0}>
                    <SkipBack className="size-4" />
                  </Button>
                  <Button type="button" size="icon" onClick={() => setIsPlaying((current) => !current)} disabled={filteredReplayEvents.length === 0}>
                    {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                  </Button>
                  <Button type="button" variant="outline" size="icon" onClick={() => setCurrentIndex((current) => Math.min(filteredReplayEvents.length - 1, current + 1))} disabled={currentIndex >= filteredReplayEvents.length - 1}>
                    <SkipForward className="size-4" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setSpeedIndex((current) => (current + 1) % PLAYBACK_SPEEDS.length)}>
                    <Gauge className="size-4" />
                    {playbackSpeed}x
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setViewMode((current) => (current === "2d" ? "3d" : "2d"))}>
                    <Layers3 className="size-4" />
                    {viewMode.toUpperCase()}
                  </Button>
                </div>

                <input
                  type="range"
                  min={0}
                  max={Math.max(filteredReplayEvents.length - 1, 0)}
                  value={Math.min(currentIndex, Math.max(filteredReplayEvents.length - 1, 0))}
                  onChange={(event) => setCurrentIndex(Math.min(Number(event.target.value), Math.max(filteredReplayEvents.length - 1, 0)))}
                  className="w-full accent-[var(--primary)]"
                  disabled={filteredReplayEvents.length === 0}
                />
                {usingTrackTimeline ? (
                  <div className="space-y-2">
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--muted)]">
                      <div
                        className="h-full bg-[color-mix(in_oklab,var(--primary),white_8%)] transition-[width] duration-300"
                        style={{ width: `${loadedTimelineRatio * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                      <span>Playback position {Math.round(loadedTimelineEventRatio * 100)}%</span>
                      <span>{filteredReplayEvents.length.toLocaleString()} / {estimatedTotalReplayEvents.toLocaleString()} replay frames</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                      <span>{timelineFramesQuery.isFetchingNextPage ? "Loading more race timeline..." : "Buffered timeline ready"}</span>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-2 text-sm text-[var(--muted-foreground)]">
                  {currentEvent ? (
                    <>
                      <div>Sequence #{currentEvent.sequence}</div>
                      <div>Topic: {currentEvent.topic}</div>
                      <div>Time: {formatDate(currentEvent.emittedAt)}</div>
                      <div>Mode: {currentEvent.mode}</div>
                      <div>Filtered events: {filteredReplayEvents.length}</div>
                    </>
                  ) : (
                    <div>Replay chunks are still loading.</div>
                  )}
                </div>
              </CardContent>
            </Card>

          <ReplayTimingTable
            rows={replayTimingRows}
            isLoading={bootQuery.isLoading}
          />

        </section>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr_1fr]">
          <Card className="bg-[var(--panel)]/95">
            <CardHeader>
              <CardTitle>Replay Internals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[var(--muted-foreground)]">
              <div>Pages loaded: {replayQuery.data?.pages.length ?? 0}</div>
              <div>Loaded chunks: {replayQuery.data?.pages.flatMap((page) => page.data).length ?? 0}</div>
              <div>Fetching next page: {replayQuery.isFetchingNextPage ? "yes" : "no"}</div>
              <div>Track sample window: {(usingTrackTimeline ? timelineDisplayFrames : (replayFrameQuery.data?.data ?? [])).length}</div>
              <div>Timeline source: {usingTrackTimeline ? "trackPosition frames" : "replay chunks"}</div>
              <div>Timeline frames loaded: {trackTimelineEvents.length}</div>
              <div>Timeline batches: {timelineFramesQuery.data?.pages.length ?? 0}</div>
              <div>Timeline fetching next: {timelineFramesQuery.isFetchingNextPage ? "yes" : "no"}</div>
              <div>Summary last sequence: {summaryQuery.data?.lastSequence ?? 0}</div>
            </CardContent>
          </Card>

          <Card className="bg-[var(--panel)]/95">
            <CardHeader>
              <CardTitle>Topic Density</CardTitle>
              <CardDescription>Message families dominating the stored replay stream.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {topicCounts.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">No replay chunks loaded yet.</p>
              ) : (
                topicCounts.slice(0, 8).map(([topic, count]) => (
                  <div key={topic} className="flex items-center justify-between rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] px-3 py-3">
                    <span className="font-medium">{topic}</span>
                    <span className="text-sm text-[var(--muted-foreground)]">{count}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="bg-[var(--panel)]/95">
            <CardHeader>
              <CardTitle>Replay Focus</CardTitle>
              <CardDescription>Current mode and why this route is kept separate from live race pages.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-[var(--muted-foreground)]">
              <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                <div className="font-medium text-[var(--foreground)]">Expand mode</div>
                <div className="mt-1">Pull the replay map into a full-screen inspection mode without leaving the replay route.</div>
              </div>
              <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                <div className="font-medium text-[var(--foreground)]">3D mode</div>
                <div className="mt-1">A dramatic perspective tilt makes it feel closer to a broadcast-grade replay surface.</div>
              </div>
              <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                <div className="font-medium text-[var(--foreground)]">Chunk-safe transport</div>
                <div className="mt-1">Historical replay keeps loading incrementally instead of dragging the live shell into memory-heavy behavior.</div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
