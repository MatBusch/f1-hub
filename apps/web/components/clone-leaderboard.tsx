"use client";

import { useMemo } from "react";

import { getLeaderboard } from "@/lib/session-insights";

type ReplayTimingRow = ReturnType<typeof getLeaderboard>[number] & {
  progress?: number;
  replayLap?: number;
  replayStatus?: string;
};

export function CloneLeaderboard({
  rows,
  currentLap,
  totalLaps,
  selectedDriver,
  onSelectDriver,
}: {
  rows: ReplayTimingRow[];
  currentLap?: number;
  totalLaps?: number;
  selectedDriver?: string | null;
  onSelectDriver?: (racingNumber: string | null) => void;
}) {
  const sortedRows = useMemo(
    () => [...rows].sort((left, right) => left.position - right.position),
    [rows],
  );

  return (
    <div className="flex h-full flex-col bg-[#0d0d0d] text-white">
      {currentLap && totalLaps ? (
        <div className="border-b border-white/10 bg-white/5 px-3 py-2">
          <div className="flex items-center justify-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-white/60">Lap</span>
            <span className="text-xl font-bold">
              {currentLap}
              <span className="text-sm text-white/40">/{totalLaps}</span>
            </span>
          </div>
        </div>
      ) : null}

      <div className="border-b border-white/10 px-3 py-2">
        <span className="text-[10px] uppercase tracking-wider text-white">Leaderboard</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {sortedRows.map((row) => {
          const status = row.replayStatus ?? (row.retired ? "Retired" : row.stopped ? "Stopped" : row.inPit ? "Pit" : "Running");

          return (
            <div
              key={row.racingNumber}
              onClick={() => onSelectDriver?.(selectedDriver === row.racingNumber ? null : row.racingNumber)}
              className={`flex cursor-pointer items-center gap-2 border-b border-white/5 px-2 py-1.5 transition-colors ${selectedDriver === row.racingNumber ? "bg-white/10" : "hover:bg-white/5"} ${row.retired ? "opacity-45" : row.inPit ? "opacity-75" : ""}`}
            >
              <div className={`flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${row.position === 1 ? "bg-red-600" : "bg-white/10"}`}>
                {row.position}
              </div>
              {row.headshotUrl ? (
                <img
                  src={row.headshotUrl}
                  alt={row.name}
                  className="h-8 w-8 rounded-full border-2 object-cover object-top"
                  style={{ borderColor: `#${row.teamColor}` }}
                />
              ) : (
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 text-[10px] font-bold"
                  style={{ borderColor: `#${row.teamColor}` }}
                >
                  {row.shortCode ?? row.racingNumber}
                </div>
              )}
              <div className="h-6 w-1 rounded-full" style={{ backgroundColor: `#${row.teamColor}` }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="truncate text-xs font-bold">{row.shortCode ?? row.racingNumber}</span>
                  {row.currentCompound ? (
                    <span className="rounded bg-white/8 px-1 py-0.5 text-[9px] uppercase text-white/60">
                      {row.currentCompound.slice(0, 1)}
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-[9px] text-white/55">{row.teamName}</div>
                <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-white/8">
                  <div className="h-full bg-white/60" style={{ width: `${Math.max(2, Math.min(100, (row.progress ?? 0) * 100))}%` }} />
                </div>
              </div>
              <div className="min-w-[52px] text-right text-[10px] text-white/90">
                {row.position === 1 ? "LEADER" : row.gapToLeader ?? row.intervalToAhead ?? "-"}
              </div>
              <div className="min-w-[38px] text-right text-[9px] text-white/55">
                {row.replayLap ?? row.numberOfLaps ?? "-"}L
              </div>
              <div className="min-w-[54px] text-right text-[9px] text-white/55">{status}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
