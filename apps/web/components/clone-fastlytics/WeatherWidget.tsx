"use client";

import type { ReplayWeather } from "@/lib/clone-replay-api";

export function WeatherWidget({ weather }: { weather: ReplayWeather }) {
  return (
    <div className="min-w-[120px] rounded-lg border border-gray-700/50 bg-black/70 px-3 py-2 text-xs backdrop-blur-sm">
      <div className="mb-1 flex items-center gap-1 text-white">
        <span className="text-[9px] uppercase tracking-wider">Weather</span>
        {weather.rainfall && <span className="text-blue-400">💧</span>}
      </div>
      <div className="space-y-0.5">
        {weather.air_temp != null ? <div className="flex justify-between text-white"><span className="text-white/60">Air</span><span>{weather.air_temp.toFixed(1)}°C</span></div> : null}
        {weather.track_temp != null ? <div className="flex justify-between text-white"><span className="text-white/60">Track</span><span>{weather.track_temp.toFixed(1)}°C</span></div> : null}
        {weather.humidity != null ? <div className="flex justify-between text-white"><span className="text-white/60">Hum</span><span>{weather.humidity.toFixed(0)}%</span></div> : null}
        {weather.wind_speed != null ? <div className="flex justify-between text-white"><span className="text-white/60">Wind</span><span>{weather.wind_speed.toFixed(1)} m/s</span></div> : null}
      </div>
    </div>
  );
}
