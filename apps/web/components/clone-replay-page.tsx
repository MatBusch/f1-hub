"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import {
  fetchRaceControl,
  fetchSessionBoot,
  fetchSessionCatalogMeta,
  fetchSessionDrivers,
  fetchTrackOutline,
  fetchTrackPositionFrames,
} from "@/lib/api";
import { getLeaderboard, getTrackSurfaceModelFromFrames, getWeather } from "@/lib/session-insights";
import { ReplayTrackCanvas } from "@/components/replay-track-canvas";
import { CloneLeaderboard } from "@/components/clone-leaderboard";
import { ClonePlaybackControls } from "@/components/clone-playback-controls";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const PLAYBACK_SPEEDS = [0.5, 1, 2, 4, 8] as const;

function hasCoordinates(frame: { x?: number | null; y?: number | null; z?: number | null }) {
  if (frame.x == null || frame.y == null) return false;
  return !(frame.x === 0 && frame.y === 0 && (frame.z ?? 0) === 0);
}

function getSessionStartTime(boot: Awaited<ReturnType<typeof fetchSessionBoot>> | undefined) {
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

function nextIsoTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed + 1).toISOString();
}

export function CloneReplayPage({ sessionKey }: { sessionKey: number }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [frameProgress, setFrameProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);

  const bootQuery = useQuery({ queryKey: ["clone", sessionKey, "boot"], queryFn: () => fetchSessionBoot(sessionKey), staleTime: 60_000 });
  const driversQuery = useQuery({ queryKey: ["clone", sessionKey, "drivers"], queryFn: () => fetchSessionDrivers(sessionKey), staleTime: 30 * 60_000 });
  const outlineQuery = useQuery({ queryKey: ["clone", sessionKey, "outline"], queryFn: () => fetchTrackOutline(sessionKey), staleTime: 30 * 60_000 });
  const raceControlQuery = useQuery({ queryKey: ["clone", sessionKey, "race-control"], queryFn: () => fetchRaceControl(sessionKey, 10), staleTime: 60_000 });
  const metaQuery = useQuery({ queryKey: ["clone", sessionKey, "meta"], queryFn: () => fetchSessionCatalogMeta(sessionKey), staleTime: 60_000 });

  const sessionStartTime = useMemo(() => getSessionStartTime(bootQuery.data), [bootQuery.data]);
  const replayEndsAt = metaQuery.data?.lastFrameAt ?? undefined;
  const outlineDriverNumber = driversQuery.data?.data?.[0]?.driverNumber;

  const timelineQuery = useInfiniteQuery({
    queryKey: ["clone", sessionKey, "timeline", sessionStartTime ?? "unknown", replayEndsAt ?? "unknown"],
    queryFn: ({ pageParam }) => fetchTrackPositionFrames(sessionKey, { fromTime: pageParam, toTime: replayEndsAt, limit: 25_000 }),
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
    queryKey: ["clone", sessionKey, "outline-frames", outlineDriverNumber ?? 0, sessionStartTime ?? "unknown"],
    queryFn: () => fetchTrackPositionFrames(sessionKey, { driverNumber: outlineDriverNumber, fromTime: sessionStartTime, toTime: replayEndsAt, limit: 8_000 }),
    enabled: Boolean(sessionStartTime) && outlineDriverNumber !== undefined,
    staleTime: 30 * 60_000,
  });

  const timelineRows = useMemo(() => timelineQuery.data?.pages.flatMap((page) => page.data) ?? [], [timelineQuery.data?.pages]);
  const groupedFrames = useMemo(() => {
    const grouped = new Map<string, Awaited<ReturnType<typeof fetchTrackPositionFrames>>["data"]>();
    for (const frame of timelineRows) {
      if (!hasCoordinates(frame)) continue;
      const current = grouped.get(frame.emittedAt) ?? [];
      current.push(frame);
      grouped.set(frame.emittedAt, current);
    }
    return grouped;
  }, [timelineRows]);
  const timelineEvents = useMemo(() => [...groupedFrames.keys()].map((emittedAt, index) => ({ emittedAt, sequence: index + 1 })), [groupedFrames]);
  const currentEvent = timelineEvents[currentIndex] ?? null;
  const nextEvent = timelineEvents[Math.min(currentIndex + 1, timelineEvents.length - 1)] ?? null;
  const playbackSpeed = PLAYBACK_SPEEDS[speedIndex] ?? 1;
  const currentFrames = currentEvent ? groupedFrames.get(currentEvent.emittedAt) ?? [] : [];
  const nextFrames = nextEvent ? groupedFrames.get(nextEvent.emittedAt) ?? [] : [];

  const currentModel = useMemo(() => getTrackSurfaceModelFromFrames({ boot: bootQuery.data, displayPositions: currentFrames, sessionDrivers: driversQuery.data?.data ?? [], outlinePoints: outlineQuery.data?.data ?? [], outlineFrames: outlineFramesQuery.data?.data ?? [] }), [bootQuery.data, currentFrames, driversQuery.data?.data, outlineFramesQuery.data?.data, outlineQuery.data?.data]);
  const nextModel = useMemo(() => getTrackSurfaceModelFromFrames({ boot: bootQuery.data, displayPositions: nextFrames, sessionDrivers: driversQuery.data?.data ?? [], outlinePoints: outlineQuery.data?.data ?? [], outlineFrames: outlineFramesQuery.data?.data ?? [] }), [bootQuery.data, driversQuery.data?.data, nextFrames, outlineFramesQuery.data?.data, outlineQuery.data?.data]);
  const leaderboard = useMemo(() => getLeaderboard(bootQuery.data), [bootQuery.data]);
  const weather = useMemo(() => getWeather(bootQuery.data), [bootQuery.data]);

  const replayRows = useMemo<Array<ReturnType<typeof getLeaderboard>[number] & { replayLap?: number; progress?: number; replayStatus?: string }>>(() => {
    if (!currentModel?.markers?.length) return leaderboard;
    const byNum = new Map(leaderboard.map((row) => [row.racingNumber, row] as const));
    return currentModel.markers.map((marker) => {
      const existing = byNum.get(marker.racingNumber);
      return {
        ...(existing ?? {
          racingNumber: marker.racingNumber,
          sectors: [],
        }),
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
        replayStatus: existing?.retired ? "Retired" : existing?.stopped ? "Stopped" : existing?.inPit ? "Pit" : "Running",
      };
    }).sort((a, b) => a.position - b.position);
  }, [currentModel?.markers, leaderboard]);

  const loadedRatio = metaQuery.data?.frameCount ? Math.min(1, timelineRows.length / metaQuery.data.frameCount) : 0;

  useEffect(() => {
    if (!isPlaying || timelineEvents.length <= 1) return;
    let frameId = 0;
    let lastTick = performance.now();
    const tick = (now: number) => {
      const deltaMs = now - lastTick;
      lastTick = now;
      setFrameProgress((current) => {
        const currentTime = Date.parse(timelineEvents[currentIndex]?.emittedAt ?? "");
        const nextTime = Date.parse(timelineEvents[Math.min(currentIndex + 1, timelineEvents.length - 1)]?.emittedAt ?? "");
        const durationMs = Math.max(nextTime - currentTime, 120);
        const nextProgress = current + (deltaMs * playbackSpeed) / durationMs;
        if (nextProgress >= 1) {
          setCurrentIndex((value) => {
            if (value >= timelineEvents.length - 2) {
              if (timelineQuery.hasNextPage && !timelineQuery.isFetchingNextPage) {
                void timelineQuery.fetchNextPage();
                return value;
              }
              setIsPlaying(false);
              return value;
            }
            return value + 1;
          });
          return nextProgress - 1;
        }
        return nextProgress;
      });
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [currentIndex, isPlaying, playbackSpeed, timelineEvents, timelineQuery.fetchNextPage, timelineQuery.hasNextPage, timelineQuery.isFetchingNextPage]);

  useEffect(() => {
    if (timelineQuery.hasNextPage && !timelineQuery.isFetchingNextPage && ((timelineQuery.data?.pages.length ?? 0) < 4 || currentIndex >= timelineEvents.length - 48)) {
      void timelineQuery.fetchNextPage();
    }
  }, [currentIndex, timelineEvents.length, timelineQuery.data?.pages.length, timelineQuery.fetchNextPage, timelineQuery.hasNextPage, timelineQuery.isFetchingNextPage]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      switch (event.key) {
        case " ":
          event.preventDefault();
          setIsPlaying((current) => !current);
          break;
        case "ArrowRight":
          event.preventDefault();
          setFrameProgress(0);
          setCurrentIndex((current) => Math.min(timelineEvents.length - 1, current + (event.shiftKey ? 120 : 20)));
          break;
        case "ArrowLeft":
          event.preventDefault();
          setFrameProgress(0);
          setCurrentIndex((current) => Math.max(0, current - (event.shiftKey ? 120 : 20)));
          break;
        case "j":
          setFrameProgress(0);
          setCurrentIndex((current) => Math.max(0, current - 40));
          break;
        case "l":
          setFrameProgress(0);
          setCurrentIndex((current) => Math.min(timelineEvents.length - 1, current + 40));
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [timelineEvents.length]);

  const isLoading = bootQuery.isLoading || driversQuery.isLoading || outlineQuery.isLoading || timelineQuery.isLoading;

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] text-white">
        <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-h-screen flex-col">
            <Skeleton className="m-4 h-[calc(100vh-104px)] rounded-xl bg-white/10" />
            <div className="border-t border-white/10 p-4"><Skeleton className="h-14 w-full bg-white/10" /></div>
          </div>
          <div className="hidden border-l border-white/10 bg-[#0d0d0d] lg:block"><Skeleton className="m-4 h-[calc(100vh-2rem)] bg-white/10" /></div>
        </div>
      </main>
    );
  }

  if (!currentModel) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] p-8 text-white">
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <div className="text-xl font-semibold">Clone replay unavailable</div>
          <div className="mt-2 text-white/60">No replay-ready track timeline is available for this session.</div>
          <Button asChild className="mt-4 bg-red-600 text-white hover:bg-red-500"><Link href="/clone">Back to clone browser</Link></Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-h-screen flex-col">
          <div className="relative min-h-0 flex-1 overflow-hidden p-4">
            <ReplayTrackCanvas
              model={currentModel}
              nextModel={nextModel}
              interpolation={frameProgress}
              isLoading={false}
              viewMode="2d"
              chrome={false}
              title={metaQuery.data?.meetingName ?? currentModel.title}
              subtitle={metaQuery.data?.sessionName ?? currentModel.subtitle}
              badgeLabel="Clone replay"
              selectedDriver={selectedDriver}
              onSelectDriver={setSelectedDriver}
              interactive
            />

            {weather ? (
              <div className="absolute right-7 top-7 rounded-lg border border-white/10 bg-black/70 px-3 py-2 text-xs backdrop-blur-sm">
                <div className="mb-1 text-[9px] uppercase tracking-wider text-white/60">Weather</div>
                <div className="space-y-1 text-white">
                  <div className="flex justify-between gap-4"><span className="text-white/60">Air</span><span>{weather.airTemp ?? "--"}C</span></div>
                  <div className="flex justify-between gap-4"><span className="text-white/60">Track</span><span>{weather.trackTemp ?? "--"}C</span></div>
                </div>
              </div>
            ) : null}

            {(raceControlQuery.data?.data ?? []).length > 0 ? (
              <div className="absolute bottom-24 right-7 flex max-w-[320px] flex-col gap-2">
                {(raceControlQuery.data?.data ?? []).slice(0, 3).map((message) => (
                  <div key={`${message.sequence}`} className="rounded-md border border-white/12 bg-black/75 px-3 py-2 text-xs backdrop-blur-sm">
                    <div className="text-[9px] uppercase tracking-wider text-white/50">{message.flag ?? message.category}</div>
                    <div className="mt-1 leading-tight text-white">{message.body}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <ClonePlaybackControls
            isPlaying={isPlaying}
            playbackSpeed={playbackSpeed}
            currentIndex={currentIndex}
            totalFrames={timelineEvents.length}
            loadedRatio={loadedRatio}
            onTogglePlay={() => setIsPlaying((current) => !current)}
            onStepBackward={() => { setFrameProgress(0); setCurrentIndex((current) => Math.max(0, current - 1)); }}
            onStepForward={() => { setFrameProgress(0); setCurrentIndex((current) => Math.min(timelineEvents.length - 1, current + 1)); }}
            onSkip={(delta) => { setFrameProgress(0); setCurrentIndex((current) => Math.min(Math.max(0, current + delta), Math.max(timelineEvents.length - 1, 0))); }}
            onSpeedCycle={() => setSpeedIndex((current) => (current + 1) % PLAYBACK_SPEEDS.length)}
            onSeek={(value) => { setFrameProgress(0); setCurrentIndex(Math.min(value, Math.max(timelineEvents.length - 1, 0))); }}
          />
        </div>

        <div className="min-h-screen border-l border-white/10 bg-[#0d0d0d]">
          <div className="flex h-full flex-col">
            <div className="border-b border-white/10 px-4 py-3 text-sm text-white/70">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Clone</div>
              <div className="mt-1 font-medium text-white">Fastlytics-style replay route</div>
              <div className="mt-2 text-xs text-white/50">{timelineEvents.length.toLocaleString()} replay frames loaded</div>
              <div className="mt-3 flex gap-2">
                <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/10"><Link href="/clone">Browser</Link></Button>
                <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/10"><Link href={`/sessions/${sessionKey}/simulate`}>Workspace</Link></Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <CloneLeaderboard
                rows={replayRows}
                currentLap={replayRows.find((row) => row.position === 1)?.replayLap}
                totalLaps={metaQuery.data?.sessionType === "Race" ? 58 : undefined}
                selectedDriver={selectedDriver}
                onSelectDriver={setSelectedDriver}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
