"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  formatReplayTime,
  getTrackStatusColor,
  getTrackStatusLabel,
  PLAYBACK_SPEEDS,
  SKIP_AMOUNTS,
} from "./replay-utils";

interface PlaybackControlsProps {
  isPlaying: boolean;
  playbackSpeed: number;
  currentTime: number;
  totalDuration: number;
  trackStatus: string;
  isFullscreen: boolean;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onSeek: (time: number) => void;
  onSkip: (seconds: number) => void;
  onFullscreen: () => void;
}

export function PlaybackControls({
  isPlaying,
  playbackSpeed,
  currentTime,
  totalDuration,
  trackStatus,
  isFullscreen,
  onTogglePlay,
  onSpeedChange,
  onSeek,
  onSkip,
  onFullscreen,
}: PlaybackControlsProps) {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  useEffect(() => {
    if (progressFillRef.current) {
      progressFillRef.current.style.width = `${progress}%`;
    }
  }, [progress]);

  const handleSpeedCycle = useCallback(() => {
    const currentIdx = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const nextIdx = (currentIdx + 1) % PLAYBACK_SPEEDS.length;
    onSpeedChange(PLAYBACK_SPEEDS[nextIdx] ?? 1);
  }, [playbackSpeed, onSpeedChange]);

  const handleProgressClick = useCallback((e: React.MouseEvent) => {
    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * totalDuration);
  }, [onSeek, totalDuration]);

  const statusColor = getTrackStatusColor(trackStatus);
  const statusLabel = getTrackStatusLabel(trackStatus);

  return (
    <div className="flex-shrink-0 border-t border-gray-800 bg-[#111111] px-4 py-2">
      <div ref={progressBarRef} className="group relative mb-3 h-1.5 w-full cursor-pointer rounded-full bg-gray-800" onClick={handleProgressClick}>
        <div ref={progressFillRef} className="relative h-full rounded-full bg-red-600" style={{ width: `${progress}%` }}>
          <div className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-md transition-opacity group-hover:opacity-100" />
        </div>
      </div>

      <div className="flex items-center gap-3 text-white">
        <div className="hidden items-center gap-1 md:flex">
          {SKIP_AMOUNTS.filter((s) => s.seconds < 0).map((skip) => (
            <button key={skip.label} onClick={() => onSkip(skip.seconds)} className="rounded px-1.5 py-0.5 text-[10px] text-white/60 transition-colors hover:bg-gray-800 hover:text-white">
              {skip.label}
            </button>
          ))}
        </div>

        <button onClick={onTogglePlay} className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-800 transition-colors hover:bg-gray-700" title={isPlaying ? "Pause (Space)" : "Play (Space)"}>
          {isPlaying ? (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
          ) : (
            <svg className="ml-0.5 h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
          )}
        </button>

        <div className="hidden items-center gap-1 md:flex">
          {SKIP_AMOUNTS.filter((s) => s.seconds > 0).map((skip) => (
            <button key={skip.label} onClick={() => onSkip(skip.seconds)} className="rounded px-1.5 py-0.5 text-[10px] text-white/60 transition-colors hover:bg-gray-800 hover:text-white">
              {skip.label}
            </button>
          ))}
        </div>

        <div className="hidden h-5 w-px bg-gray-700 md:block" />

        <div className="min-w-[80px] font-sans text-xs text-white">
          {formatReplayTime(currentTime)}
          <span className="text-white/40"> / {formatReplayTime(totalDuration)}</span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor }} />
          <span className="text-[10px]" style={{ color: statusColor }}>{statusLabel}</span>
        </div>

        <button onClick={handleSpeedCycle} className="min-w-[42px] rounded border border-gray-700 bg-gray-800 px-2 py-0.5 text-center text-xs text-white transition-colors hover:bg-gray-700">
          {playbackSpeed}x
        </button>

        <button onClick={onFullscreen} className="rounded p-1.5 text-white transition-colors hover:bg-gray-800" title="Fullscreen (F)">
          {isFullscreen ? (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" /></svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" /></svg>
          )}
        </button>
      </div>
    </div>
  );
}
