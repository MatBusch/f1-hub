"use client";

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { Button } from "@/components/ui/button";

function formatReplayTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ClonePlaybackControls({
  isPlaying,
  playbackSpeed,
  currentIndex,
  totalFrames,
  loadedRatio,
  onTogglePlay,
  onStepBackward,
  onStepForward,
  onSkip,
  onSpeedCycle,
  onSeek,
}: {
  isPlaying: boolean;
  playbackSpeed: number;
  currentIndex: number;
  totalFrames: number;
  loadedRatio: number;
  onTogglePlay: () => void;
  onStepBackward: () => void;
  onStepForward: () => void;
  onSkip: (delta: number) => void;
  onSpeedCycle: () => void;
  onSeek: (value: number) => void;
}) {
  const durationSeconds = Math.max(totalFrames / 4, 0);
  const currentSeconds = Math.max(currentIndex / 4, 0);

  return (
    <div className="border-t border-white/10 bg-[#111111] px-4 py-2 text-white">
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-red-600" style={{ width: `${Math.min(100, loadedRatio * 100)}%` }} />
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-1 md:flex">
          {[-1200, -240, -40].map((delta) => (
            <button key={delta} onClick={() => onSkip(delta)} className="rounded px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/10 hover:text-white">
              {delta === -1200 ? "-5m" : delta === -240 ? "-1m" : "-10s"}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={onStepBackward}>
          <SkipBack className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="rounded-full bg-white/10 text-white hover:bg-white/15" onClick={onTogglePlay}>
          {isPlaying ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
        </Button>
        <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={onStepForward}>
          <SkipForward className="size-4" />
        </Button>
        <div className="hidden items-center gap-1 md:flex">
          {[40, 240, 1200].map((delta) => (
            <button key={delta} onClick={() => onSkip(delta)} className="rounded px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/10 hover:text-white">
              {delta === 1200 ? "+5m" : delta === 240 ? "+1m" : "+10s"}
            </button>
          ))}
        </div>

        <div className="min-w-[96px] text-xs text-white">
          {formatReplayTime(currentSeconds)}
          <span className="text-white/40"> / {formatReplayTime(durationSeconds)}</span>
        </div>

        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={Math.max(totalFrames - 1, 0)}
            value={Math.min(currentIndex, Math.max(totalFrames - 1, 0))}
            onChange={(event) => onSeek(Number(event.target.value))}
            className="w-full accent-red-600"
          />
        </div>

        <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={onSpeedCycle}>
          {playbackSpeed}x
        </Button>
      </div>
    </div>
  );
}
