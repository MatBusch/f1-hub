"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  fetchReplayChunkForClone,
  fetchReplayMetadataForClone,
  type ReplayChunk,
  type ReplayFrame,
  type ReplayMetadata,
} from "@/lib/clone-replay-api";
import { Leaderboard } from "./Leaderboard";
import { PlaybackControls } from "./PlaybackControls";
import { RaceControlMessages } from "./RaceControlMessages";
import { WeatherWidget } from "./WeatherWidget";
import { TrackCanvas } from "./TrackCanvas";

export function SessionReplay({ sessionKey }: { sessionKey: number }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const lastTickRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);
  const allFramesRef = useRef<ReplayFrame[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: metadata, isLoading: metaLoading, error: metaError } = useQuery<ReplayMetadata>({
    queryKey: ["clone-fastlytics-metadata", sessionKey],
    queryFn: () => fetchReplayMetadataForClone(sessionKey),
    staleTime: Infinity,
    retry: 2,
  });

  const [loadedChunks, setLoadedChunks] = useState<Set<number>>(new Set());
  const [loadingChunk, setLoadingChunk] = useState(false);

  useEffect(() => {
    if (!metadata?.chunk_manifest) return;

    const loadNextChunk = async () => {
      const nextChunkId = metadata.chunk_manifest.find((chunk) => !loadedChunks.has(chunk.id))?.id;
      if (nextChunkId === undefined) return;
      setLoadingChunk(true);
      try {
        const chunk = await fetchReplayChunkForClone(sessionKey, nextChunkId);
        allFramesRef.current = [...allFramesRef.current, ...chunk.frames].sort((left, right) => left.timestamp - right.timestamp);
        setLoadedChunks((prev) => new Set([...prev, nextChunkId]));
      } finally {
        setLoadingChunk(false);
      }
    };

    void loadNextChunk();
  }, [loadedChunks, metadata, sessionKey]);

  useEffect(() => {
    if (!metadata?.chunk_manifest || loadingChunk) return;
    const allLoaded = metadata.chunk_manifest.every((chunk) => loadedChunks.has(chunk.id));
    if (!allLoaded) {
      const timer = setTimeout(() => setLoadedChunks((prev) => new Set(prev)), 100);
      return () => clearTimeout(timer);
    }
  }, [loadedChunks, loadingChunk, metadata]);

  const frameData = useMemo(() => {
    const frames = allFramesRef.current;
    if (!frames.length) return { current: null, next: null };
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((frames[mid]?.timestamp ?? 0) <= currentTime) lo = mid;
      else hi = mid - 1;
    }
    return {
      current: frames[lo] ?? null,
      next: frames[lo < frames.length - 1 ? lo + 1 : lo] ?? null,
    };
  }, [currentTime, loadedChunks.size]);

  const currentFrame = frameData.current;
  const nextFrame = frameData.next;

  const tick = useCallback((now: number) => {
    if (!isPlaying) return;
    const delta = (now - lastTickRef.current) / 1000;
    lastTickRef.current = now;
    if (delta > 0 && delta < 1) {
      const frames = allFramesRef.current;
      const maxTime = frames.length ? (frames[frames.length - 1]?.timestamp ?? 0) : 0;
      setCurrentTime((prev) => {
        const next = prev + delta * playbackSpeed;
        if (next >= maxTime) {
          setIsPlaying(false);
          return maxTime;
        }
        return next;
      });
    }
    animFrameRef.current = requestAnimationFrame(tick);
  }, [isPlaying, playbackSpeed]);

  useEffect(() => {
    if (isPlaying) {
      lastTickRef.current = performance.now();
      animFrameRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, tick]);

  const handleSpeedChange = useCallback((speed: number) => setPlaybackSpeed(speed), []);
  const handleSeek = useCallback((time: number) => {
    const frames = allFramesRef.current;
    const maxTime = frames.length ? (frames[frames.length - 1]?.timestamp ?? 0) : 0;
    setCurrentTime(Math.max(0, Math.min(time, maxTime)));
  }, []);
  const handleSkip = useCallback((seconds: number) => handleSeek(currentTime + seconds), [currentTime, handleSeek]);
  const handleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      void containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          setIsPlaying((prev) => !prev);
          break;
        case "ArrowRight":
          e.preventDefault();
          handleSkip(e.shiftKey ? 30 : 5);
          break;
        case "ArrowLeft":
          e.preventDefault();
          handleSkip(e.shiftKey ? -30 : -5);
          break;
        case "f":
          handleFullscreen();
          break;
        case "j":
          handleSkip(-10);
          break;
        case "l":
          handleSkip(10);
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFullscreen, handleSkip]);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  if (metaLoading) {
    return <div className="flex h-full min-h-screen items-center justify-center bg-[#0a0a0a] text-sm text-white/60">Loading replay data...</div>;
  }

  if (metaError || !metadata) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-red-400">
        <div className="text-center">
          <div className="mb-2 text-lg font-mono">REPLAY UNAVAILABLE</div>
          <div className="text-sm text-gray-500">{metaError instanceof Error ? metaError.message : "Failed to load replay data"}</div>
        </div>
      </div>
    );
  }

  const totalChunks = metadata.chunk_manifest.length;
  const chunksLoaded = loadedChunks.size;
  const hasFrames = allFramesRef.current.length > 0;

  if (!hasFrames) {
    return <div className="flex h-full min-h-screen items-center justify-center bg-[#0a0a0a] text-sm text-white/60">{loadingChunk ? `Loading replay data... ${chunksLoaded}/${totalChunks}` : "Processing..."}</div>;
  }

  return (
    <div ref={containerRef} className={`relative flex flex-col overflow-hidden bg-[#0a0a0a] ${isFullscreen ? "h-screen" : "h-full min-h-screen"}`}>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <TrackCanvas
            track={metadata.track}
            currentFrame={currentFrame}
            nextFrame={nextFrame}
            currentTime={currentTime}
            driverColors={metadata.driver_colors}
            selectedDriver={selectedDriver}
            onSelectDriver={setSelectedDriver}
          />

          {currentFrame?.weather ? <div className="absolute right-3 top-3 z-10"><WeatherWidget weather={currentFrame.weather} /></div> : null}
          <div className="absolute bottom-16 right-3 z-10"><RaceControlMessages frame={currentFrame} /></div>
          {loadingChunk && chunksLoaded < totalChunks ? (
            <div className="absolute left-3 top-3 z-10 rounded-md border border-gray-700 bg-black/70 px-3 py-1.5 backdrop-blur-sm">
              <span className="text-xs text-gray-400">BUFFERING {chunksLoaded}/{totalChunks}</span>
            </div>
          ) : null}
        </div>

        <div className="w-[340px] flex-shrink-0 overflow-y-auto border-l border-gray-800">
          <Leaderboard
            frame={currentFrame}
            driverInfo={metadata.drivers}
            driverColors={metadata.driver_colors}
            selectedDriver={selectedDriver}
            onSelectDriver={setSelectedDriver}
            isRace={metadata.session_info.is_race}
            currentLap={currentFrame?.lap}
            totalLaps={currentFrame?.total_laps ?? metadata.session_info.total_laps}
          />
        </div>
      </div>

      <PlaybackControls
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        currentTime={currentTime}
        totalDuration={metadata.total_duration}
        trackStatus={currentFrame?.track_status ?? "green"}
        isFullscreen={isFullscreen}
        onTogglePlay={() => setIsPlaying((prev) => !prev)}
        onSpeedChange={handleSpeedChange}
        onSeek={handleSeek}
        onSkip={handleSkip}
        onFullscreen={handleFullscreen}
      />
    </div>
  );
}
