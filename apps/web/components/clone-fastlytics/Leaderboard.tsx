"use client";

import { useMemo, useState } from "react";

import type { ReplayDriverInfo, ReplayFrame } from "@/lib/clone-replay-api";
import { getFlagDisplay, getGridDelta, getTyreColor, getTyreShort } from "./replay-utils";

interface LeaderboardProps {
  frame: ReplayFrame | null;
  driverInfo: Record<string, ReplayDriverInfo>;
  driverColors: Record<string, string>;
  selectedDriver: string | null;
  onSelectDriver: (abbr: string | null) => void;
  isRace: boolean;
  currentLap?: number;
  totalLaps?: number;
}

const DEFAULT_COLUMNS: Record<string, boolean> = {
  gapInterval: true,
  gridDelta: true,
  tyre: true,
  tyreAge: true,
  tyreHistory: true,
  pitStops: true,
};

export function Leaderboard({
  frame,
  driverInfo,
  driverColors,
  selectedDriver,
  onSelectDriver,
  isRace,
  currentLap,
  totalLaps,
}: LeaderboardProps) {
  const [showGap, setShowGap] = useState(true);
  const [columns, setColumns] = useState<Record<string, boolean>>(DEFAULT_COLUMNS);
  const [showSettings, setShowSettings] = useState(false);

  const sortedDrivers = useMemo(() => {
    if (!frame?.drivers) return [];
    return [...frame.drivers].sort((a, b) => {
      if (a.retired && !b.retired) return 1;
      if (!a.retired && b.retired) return -1;
      if (a.position == null) return 1;
      if (b.position == null) return -1;
      return a.position - b.position;
    });
  }, [frame]);

  if (!frame) {
    return <div className="flex h-full items-center justify-center bg-[#0d0d0d]"><span className="text-xs text-white">NO DATA</span></div>;
  }

  return (
    <div className="flex h-full flex-col bg-[#0d0d0d]">
      {currentLap && totalLaps ? (
        <div className="border-b border-gray-800 bg-gray-900/50 px-3 py-2">
          <div className="flex items-center justify-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-white/60">Lap</span>
            <span className="text-xl font-bold text-white">{currentLap}<span className="text-sm text-white/40">/{totalLaps}</span></span>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-white">Leaderboard</span>
          <button onClick={() => setShowGap(!showGap)} className="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[9px] text-white">
            {showGap ? "GAP" : "INT"}
          </button>
        </div>

        <div className="relative">
          <button onClick={() => setShowSettings(!showSettings)} className="rounded p-1 text-white transition-colors hover:bg-gray-800">
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>
          </button>
          {showSettings ? (
            <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-gray-700 bg-gray-900 p-2 shadow-xl">
              {Object.entries(columns).map(([key, enabled]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-800">
                  <input type="checkbox" checked={enabled} onChange={() => setColumns((prev) => ({ ...prev, [key]: !prev[key] }))} className="h-3 w-3 accent-red-500" />
                  <span className="text-[10px] capitalize text-white">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {sortedDrivers.map((drv) => {
          const info = driverInfo[drv.abbr];
          const color = driverColors[drv.abbr] || "#888";
          const isSelected = drv.abbr === selectedDriver;
          const gridDelta = isRace ? getGridDelta(drv.position, drv.grid_position) : null;
          const flagDisplay = getFlagDisplay(drv.flag);

          return (
            <div key={drv.abbr} onClick={() => onSelectDriver(isSelected ? null : drv.abbr)} className={`flex cursor-pointer items-center gap-1.5 border-b border-gray-800/50 px-2 py-1.5 transition-colors ${isSelected ? "bg-gray-800/80" : "hover:bg-gray-800/40"} ${drv.retired ? "opacity-40" : drv.in_pit ? "opacity-70" : ""}`}>
              <div className={`flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${drv.position === 1 ? "bg-red-600 text-white" : "bg-gray-800 text-white"}`}>
                {drv.retired ? "—" : drv.in_pit ? "PIT" : (drv.position ?? "—")}
              </div>
              <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border-2 bg-gray-800" style={{ borderColor: color }}>
                {info?.headshotUrl ? <img src={info.headshotUrl} className="h-full w-full object-cover object-top" alt={drv.abbr} /> : null}
              </div>
              <div className="h-6 w-1 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="truncate text-xs font-bold text-white">{drv.abbr}</span>
                  {drv.has_fastest_lap ? <span className="h-2 w-2 flex-shrink-0 rounded-full bg-purple-500" title="Fastest Lap" /> : null}
                  {flagDisplay ? <span className="flex-shrink-0 text-[10px]" style={{ color: flagDisplay.color }}>{flagDisplay.icon}</span> : null}
                </div>
                {info ? <div className="truncate text-[9px] text-white/60">{info.team}</div> : null}
              </div>
              {columns.gapInterval ? <div className="min-w-[48px] text-right text-[10px] text-white">{drv.position === 1 ? <span className="text-white/60">LEADER</span> : (showGap ? drv.gap : drv.interval) || "—"}</div> : null}
              {columns.gridDelta && isRace && gridDelta ? <div className="min-w-[24px] text-right text-[10px]" style={{ color: gridDelta.color }}>{gridDelta.label}</div> : null}
              {columns.tyre && drv.compound ? <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[8px] font-bold" style={{ backgroundColor: `${getTyreColor(drv.compound)}22`, borderColor: getTyreColor(drv.compound), color: getTyreColor(drv.compound) }}>{getTyreShort(drv.compound)}</div> : null}
              {columns.tyreAge && drv.tyre_life != null ? <span className="min-w-[16px] text-right text-[9px] text-white/60">{drv.tyre_life}L</span> : null}
              {columns.tyreHistory && drv.tyre_history.length > 1 ? <div className="flex flex-shrink-0 gap-0.5">{drv.tyre_history.map((comp, i) => <div key={i} className="h-2 w-2 rounded-full" style={{ backgroundColor: getTyreColor(comp) }} />)}</div> : null}
              {columns.pitStops && drv.pit_stops > 0 ? <div className="flex-shrink-0 rounded border border-gray-700 bg-gray-800 px-1 text-[9px] text-white/60">{drv.pit_stops}s</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
