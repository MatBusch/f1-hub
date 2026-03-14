"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  ChevronDown,
  Gauge,
  GitCompare,
  Map,
  Search,
  TrendingUp,
  Zap,
} from "lucide-react";

import {
  fetchSessionSummary,
  fetchTelemetryLaps,
  fetchTelemetryTrace,
  fetchTrackPositionFrames,
  fetchSessionDrivers,
} from "@/lib/api";
import { type TelemetryLapSummary, type TelemetrySample } from "@f1-hub/contracts";
import { Card, CardContent } from "@/components/ui/card";

function formatLapTimeFromMs(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "--:--.---";
  }

  const totalSeconds = value / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = (totalSeconds % 60).toFixed(3);
  return `${minutes}:${Number.parseFloat(remainder) < 10 ? "0" : ""}${remainder}`;
}

function computeLapStats(samples: TelemetrySample[]) {
  if (samples.length === 0) {
    return null;
  }

  let topSpeed = 0;
  let speedTotal = 0;
  let speedCount = 0;
  let maxRpm = 0;
  let gearChanges = 0;
  let drsActivations = 0;
  let fullThrottleCount = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!;
    const previous = index > 0 ? samples[index - 1]! : null;
    const speed = sample.speed ?? 0;
    const rpm = sample.rpm ?? 0;
    const gear = sample.gear ?? null;
    const previousGear = previous?.gear ?? null;
    const drs = sample.drs ?? 0;
    const previousDrs = previous?.drs ?? 0;

    topSpeed = Math.max(topSpeed, speed);
    maxRpm = Math.max(maxRpm, rpm);

    if (speed > 0) {
      speedTotal += speed;
      speedCount += 1;
    }

    if ((sample.throttle ?? 0) >= 98) {
      fullThrottleCount += 1;
    }

    if (previous && gear != null && previousGear != null && gear !== previousGear) {
      gearChanges += 1;
    }

    if (previous && drs >= 10 && previousDrs < 10) {
      drsActivations += 1;
    }
  }

  return {
    topSpeed,
    avgSpeed: speedCount > 0 ? Math.round(speedTotal / speedCount) : 0,
    maxRpm,
    gearChanges,
    drsActivations,
    fullThrottlePct: Math.round((fullThrottleCount / samples.length) * 100),
  };
}

function StatTile({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div className="bg-[var(--muted)] p-2.5 text-center">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">{label}</div>
      <div className="font-mono text-lg font-bold text-[var(--foreground)]">
        {value}
        {unit ? <span className="ml-0.5 text-xs text-[var(--muted-foreground)]">{unit}</span> : null}
      </div>
    </div>
  );
}

function DriverLapCard({
  title,
  teamColor,
  driverName,
  teamName,
  lap,
}: {
  title?: string;
  teamColor: string;
  driverName: string;
  teamName: string;
  lap: TelemetryLapSummary | null;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute right-4 top-0 text-[110px] font-black leading-none text-[var(--muted)]/40">
        {lap?.lapNumber ?? "-"}
      </div>
      <CardContent className="relative z-10 flex items-center gap-4 p-4">
        <div className="h-12 w-1.5" style={{ backgroundColor: teamColor }} />
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-black tracking-tight">{driverName}</h3>
            {title ? (
              <span className="bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
                {title}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">{teamName}</p>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs text-[var(--muted-foreground)]">Lap {lap?.lapNumber ?? "--"}</div>
          <div className="font-mono text-lg font-bold" style={{ color: teamColor }}>
            {formatLapTimeFromMs(lap?.lapDurationMs)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DriverDropdown({
  label,
  drivers,
  selectedNumber,
  onSelect,
  allowNone = false,
}: {
  label: string;
  drivers: Array<{ driverNumber: number; nameAcronym: string; teamColor: string; fullName: string }>;
  selectedNumber: number | null;
  onSelect: (driverNumber: number | null) => void;
  allowNone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = drivers.find((d) => d.driverNumber === selectedNumber);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <label className="mb-1.5 block text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-[12px] transition-colors hover:bg-[var(--muted)]"
      >
        {selected ? (
          <span className="flex items-center gap-2">
            <span className="inline-block size-2" style={{ backgroundColor: `#${selected.teamColor}` }} />
            <span className="font-bold" style={{ color: `#${selected.teamColor}` }}>{selected.driverNumber}</span>
            <span>{selected.nameAcronym}</span>
          </span>
        ) : (
          <span className="text-[var(--muted-foreground)]">{allowNone ? "None" : "Select..."}</span>
        )}
        <ChevronDown className="size-3.5 text-[var(--muted-foreground)]" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-[240px] w-full overflow-y-auto border border-[var(--border)] bg-[var(--panel)]">
          {allowNone && (
            <button
              type="button"
              onClick={() => { onSelect(null); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors hover:bg-[var(--muted)] ${selectedNumber == null ? "bg-[var(--muted)]" : ""}`}
            >
              <span className="inline-block size-2 border border-dashed border-[var(--border-strong)]" />
              <span className="text-[var(--muted-foreground)]">None</span>
            </button>
          )}
          {drivers.map((driver) => (
            <button
              key={driver.driverNumber}
              type="button"
              onClick={() => { onSelect(driver.driverNumber); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors hover:bg-[var(--muted)] ${selectedNumber === driver.driverNumber ? "bg-[var(--muted)]" : ""}`}
            >
              <span className="inline-block size-2" style={{ backgroundColor: `#${driver.teamColor}` }} />
              <span className="font-bold" style={{ color: `#${driver.teamColor}` }}>{driver.driverNumber}</span>
              <span>{driver.nameAcronym}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TraceChart({
  title,
  icon,
  data,
  compareData = [],
  dataKey,
  unit,
  color,
  compareColor,
  height,
  hoverIndex,
  onHover,
  isGear = false,
  driverName,
  compareDriverName,
}: {
  title: string;
  icon: React.ReactNode;
  data: TelemetrySample[];
  compareData?: TelemetrySample[];
  dataKey: keyof TelemetrySample;
  unit: string;
  color: string;
  compareColor?: string;
  height: number;
  hoverIndex: number | null;
  onHover: (index: number | null) => void;
  isGear?: boolean;
  driverName: string;
  compareDriverName?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const primaryValues = data.map((sample) => Number(sample[dataKey] ?? 0));
  const compareValues = compareData.map((sample) => Number(sample[dataKey] ?? 0));
  const allValues = [...primaryValues, ...compareValues];
  const maxValue = Math.max(...allValues, 0);
  const minValue = isGear ? 0 : Math.min(...allValues, 0);
  const span = Math.max(maxValue - minValue, 1);
  const activeValue = hoverIndex == null ? null : primaryValues[hoverIndex] ?? null;
  const compareIndex =
    hoverIndex == null || compareValues.length === 0
      ? null
      : Math.round((hoverIndex / Math.max(primaryValues.length - 1, 1)) * Math.max(compareValues.length - 1, 0));
  const activeCompareValue = compareIndex == null ? null : compareValues[compareIndex] ?? null;

  const handleHover = (clientX: number) => {
    const node = containerRef.current;
    if (!node || primaryValues.length === 0) {
      return;
    }

    const rect = node.getBoundingClientRect();
    const index = Math.round(((clientX - rect.left) / rect.width) * (primaryValues.length - 1));
    onHover(Math.max(0, Math.min(primaryValues.length - 1, index)));
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
            {icon}
            {title}
          </h3>
          {hoverIndex != null ? (
            <div className="flex items-center gap-3 font-mono text-xs">
              <span style={{ color }}>
                {driverName}: {Math.round(activeValue ?? 0)}
                {unit}
              </span>
              {activeCompareValue != null && compareColor && compareDriverName ? (
                <span style={{ color: compareColor }}>
                  {compareDriverName}: {Math.round(activeCompareValue)}
                  {unit}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div
          ref={containerRef}
          className="relative cursor-crosshair"
          style={{ height }}
          onMouseMove={(event) => handleHover(event.clientX)}
          onMouseLeave={() => onHover(null)}
        >
          <svg className="h-full w-full" preserveAspectRatio="none" viewBox={`0 0 ${Math.max(primaryValues.length, 1)} 100`}>
            {[0, 25, 50, 75, 100].map((line) => (
              <line
                key={line}
                x1="0"
                y1={line}
                x2={Math.max(primaryValues.length, 1)}
                y2={line}
                stroke="currentColor"
                strokeOpacity="0.08"
              />
            ))}
            {compareValues.length > 0 && compareColor ? (
              <polyline
                points={compareValues
                  .map((value, index) => {
                    const x = (index / Math.max(compareValues.length - 1, 1)) * Math.max(primaryValues.length - 1, 1);
                    const y = 100 - ((value - minValue) / span) * 100;
                    return `${x},${y}`;
                  })
                  .join(" ")}
                fill="none"
                stroke={compareColor}
                strokeDasharray="4 2"
                strokeOpacity="0.55"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            <polyline
              points={primaryValues
                .map((value, index) => `${index},${100 - ((value - minValue) / span) * 100}`)
                .join(" ")}
              fill="none"
              stroke={color}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            {hoverIndex != null && activeValue != null ? (
              <>
                <line x1={hoverIndex} y1="0" x2={hoverIndex} y2="100" stroke="var(--foreground)" strokeOpacity="0.3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <circle
                  cx={hoverIndex}
                  cy={100 - ((activeValue - minValue) / span) * 100}
                  r="4"
                  fill={color}
                  stroke="var(--foreground)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : null}
          </svg>
          <div className="absolute left-0 top-0 bg-[var(--background)]/80 px-1 text-[10px] font-mono text-[var(--muted-foreground)]">
            {Math.round(maxValue)}
            {unit}
          </div>
          <div className="absolute bottom-0 left-0 bg-[var(--background)]/80 px-1 text-[10px] font-mono text-[var(--muted-foreground)]">
            {Math.round(minValue)}
            {unit}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PedalTrace({
  label,
  data,
  dataKey,
  color,
  height,
  hoverIndex,
  onHover,
}: {
  label: string;
  data: TelemetrySample[];
  dataKey: keyof TelemetrySample;
  color: string;
  height: number;
  hoverIndex: number | null;
  onHover: (index: number | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const values = data.map((sample) => Number(sample[dataKey] ?? 0));
  const activeValue = hoverIndex == null ? null : values[hoverIndex] ?? null;

  const handleHover = (clientX: number) => {
    const node = containerRef.current;
    if (!node || values.length === 0) {
      return;
    }

    const rect = node.getBoundingClientRect();
    const index = Math.round(((clientX - rect.left) / rect.width) * (values.length - 1));
    onHover(Math.max(0, Math.min(values.length - 1, index)));
  };

  return (
    <div
      ref={containerRef}
      className="relative cursor-crosshair"
      style={{ height }}
      onMouseMove={(event) => handleHover(event.clientX)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="absolute left-2 top-1 z-10 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">{label}</span>
        {activeValue != null ? (
          <span className="text-[10px] font-mono" style={{ color }}>
            {activeValue}%
          </span>
        ) : null}
      </div>
      <svg className="h-full w-full" preserveAspectRatio="none" viewBox={`0 0 ${Math.max(values.length, 1)} 100`}>
        <polygon
          points={`0,100 ${values.map((value, index) => `${index},${100 - value}`).join(" ")} ${Math.max(values.length - 1, 0)},100`}
          fill={color}
          fillOpacity="0.22"
        />
        <polyline
          points={values.map((value, index) => `${index},${100 - value}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        {hoverIndex != null ? (
          <line x1={hoverIndex} y1="0" x2={hoverIndex} y2="100" stroke="var(--foreground)" strokeOpacity="0.3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ) : null}
      </svg>
    </div>
  );
}

function TrackMap({
  points,
  color,
  hoverIndex,
  totalPoints,
}: {
  points: Array<{ x: number; y: number }>;
  color: string;
  hoverIndex: number | null;
  totalPoints: number;
}) {
  if (points.length === 0) {
    return <div className="flex h-full items-center justify-center text-xs text-[var(--muted-foreground)]">No GPS Data</div>;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 1;
  const spanY = Math.max(...ys) - minY || 1;
  const padding = 0.1 * Math.max(spanX, spanY);
  const activeIndex =
    hoverIndex == null ? null : Math.round((hoverIndex / Math.max(totalPoints, 1)) * Math.max(points.length - 1, 0));
  const activePoint = activeIndex == null ? null : points[activeIndex] ?? null;

  return (
    <svg
      className="h-full w-full"
      viewBox={`${minX - padding} ${minY - padding} ${spanX + padding * 2} ${spanY + padding * 2}`}
      style={{ transform: "scale(1, -1)" }}
    >
      <polyline
        points={points.map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.35"
        strokeWidth={Math.max(spanX, spanY) * 0.012}
      />
      {activePoint ? (
        <circle
          cx={activePoint.x}
          cy={activePoint.y}
          r={Math.max(spanX, spanY) * 0.025}
          fill={color}
          stroke="var(--foreground)"
          strokeWidth={Math.max(spanX, spanY) * 0.008}
        />
      ) : null}
    </svg>
  );
}

export function TelemetryWorkspace({ sessionKey }: { sessionKey: number }) {
  const [primaryDriverNumber, setPrimaryDriverNumber] = useState<number | null>(null);
  const [compareDriverNumber, setCompareDriverNumber] = useState<number | null>(null);
  const [selectedLapNumber, setSelectedLapNumber] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["telemetry", sessionKey, "summary"],
    queryFn: () => fetchSessionSummary(sessionKey),
    staleTime: 60_000,
  });
  const driversQuery = useQuery({
    queryKey: ["telemetry", sessionKey, "drivers"],
    queryFn: () => fetchSessionDrivers(sessionKey),
    staleTime: 30 * 60_000,
  });

  const drivers = driversQuery.data?.data ?? [];

  useEffect(() => {
    if (drivers.length === 0) {
      setPrimaryDriverNumber(null);
      return;
    }

    setPrimaryDriverNumber((current) =>
      current && drivers.some((driver) => driver.driverNumber === current)
        ? current
        : drivers[0]!.driverNumber,
    );
  }, [drivers]);

  const primaryLapsQuery = useQuery({
    queryKey: ["telemetry", sessionKey, "laps", primaryDriverNumber ?? 0],
    queryFn: () => fetchTelemetryLaps(sessionKey, primaryDriverNumber!),
    enabled: primaryDriverNumber !== null,
    staleTime: 60_000,
  });

  const compareLapsQuery = useQuery({
    queryKey: ["telemetry", sessionKey, "compare-laps", compareDriverNumber ?? 0],
    queryFn: () => fetchTelemetryLaps(sessionKey, compareDriverNumber!),
    enabled: compareDriverNumber !== null,
    staleTime: 60_000,
  });

  const primaryLaps = primaryLapsQuery.data?.data ?? [];
  const compareLaps = compareLapsQuery.data?.data ?? [];

  useEffect(() => {
    if (primaryLaps.length === 0) {
      setSelectedLapNumber(null);
      return;
    }

    setSelectedLapNumber((current) => {
      if (current && primaryLaps.some((lap) => lap.lapNumber === current)) {
        return current;
      }

      const bestLap = primaryLaps
        .filter((lap) => lap.lapDurationMs != null && !lap.isPitOutLap)
        .sort((left, right) => (left.lapDurationMs ?? Number.MAX_SAFE_INTEGER) - (right.lapDurationMs ?? Number.MAX_SAFE_INTEGER))[0];

      return bestLap?.lapNumber ?? primaryLaps[primaryLaps.length - 1]!.lapNumber;
    });
  }, [primaryLaps]);

  const selectedPrimaryDriver = useMemo(
    () => drivers.find((driver) => driver.driverNumber === primaryDriverNumber) ?? null,
    [drivers, primaryDriverNumber],
  );
  const selectedCompareDriver = useMemo(
    () => drivers.find((driver) => driver.driverNumber === compareDriverNumber) ?? null,
    [compareDriverNumber, drivers],
  );
  const selectedPrimaryLap = useMemo(
    () => primaryLaps.find((lap) => lap.lapNumber === selectedLapNumber) ?? null,
    [primaryLaps, selectedLapNumber],
  );
  const selectedCompareLap = useMemo(
    () => compareLaps.find((lap) => lap.lapNumber === selectedLapNumber) ?? null,
    [compareLaps, selectedLapNumber],
  );

  const primaryTraceQuery = useQuery({
    queryKey: ["telemetry", sessionKey, "trace", primaryDriverNumber ?? 0, selectedLapNumber ?? 0],
    queryFn: () => fetchTelemetryTrace(sessionKey, primaryDriverNumber!, selectedLapNumber!),
    enabled: primaryDriverNumber !== null && selectedLapNumber !== null,
    staleTime: 60_000,
  });
  const compareTraceQuery = useQuery({
    queryKey: ["telemetry", sessionKey, "compare-trace", compareDriverNumber ?? 0, selectedLapNumber ?? 0],
    queryFn: () => fetchTelemetryTrace(sessionKey, compareDriverNumber!, selectedLapNumber!),
    enabled: compareDriverNumber !== null && selectedLapNumber !== null,
    staleTime: 60_000,
  });
  const trackMapQuery = useQuery({
    queryKey: [
      "telemetry",
      sessionKey,
      "track-map",
      primaryDriverNumber ?? 0,
      selectedPrimaryLap?.lapStartTime ?? "",
      selectedPrimaryLap?.lapEndTime ?? "",
    ],
    queryFn: () =>
      fetchTrackPositionFrames(sessionKey, {
        driverNumber: primaryDriverNumber!,
        fromTime: selectedPrimaryLap?.lapStartTime,
        toTime: selectedPrimaryLap?.lapEndTime ?? undefined,
        limit: 5000,
      }),
    enabled: primaryDriverNumber !== null && selectedPrimaryLap !== null,
    staleTime: 60_000,
  });

  const primaryTrace = primaryTraceQuery.data?.data ?? [];
  const compareTrace = compareTraceQuery.data?.data ?? [];
  const mapPoints = (trackMapQuery.data?.data ?? [])
    .flatMap((frame) =>
      frame.x != null && frame.y != null ? [{ x: frame.x, y: frame.y }] : [],
    );
  const lapStats = useMemo(() => computeLapStats(primaryTrace), [primaryTrace]);
  const primaryColor = `#${selectedPrimaryDriver?.teamColor ?? "e10600"}`;
  const compareColor = selectedCompareDriver?.teamColor ? `#${selectedCompareDriver.teamColor}` : undefined;
  const sessionLabel =
    summaryQuery.data?.session.sessionName ?? summaryQuery.data?.session.sessionType ?? "Telemetry";
  const meetingLabel = summaryQuery.data?.session.meetingKey ? summaryQuery.data.session.sessionType : "Session";

  const compareDrivers = useMemo(
    () => drivers.filter((d) => d.driverNumber !== primaryDriverNumber),
    [drivers, primaryDriverNumber],
  );

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-7xl p-2 sm:p-4 lg:p-8">
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-3">
            <Link
              href={`/sessions/${sessionKey}`}
              className="inline-flex items-center gap-2 border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <ArrowLeft className="size-3.5" />
              Back to session
            </Link>
          </div>
          <h1 className="text-xl font-bold">Telemetry Analysis</h1>
          <p className="text-[12px] text-[var(--muted-foreground)]">
            {sessionLabel} telemetry for session {sessionKey}. Compare drivers, inspect speed traces, and view GPS lap maps.
          </p>
        </div>

        <div className="space-y-4">
          {/* Driver & Lap Selection */}
          <Card>
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em]">Select Driver & Lap</h2>
            </div>
            <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
              <DriverDropdown
                label="Primary driver"
                drivers={drivers}
                selectedNumber={primaryDriverNumber}
                onSelect={(n) => setPrimaryDriverNumber(n)}
              />
              <DriverDropdown
                label="Compare driver"
                drivers={compareDrivers}
                selectedNumber={compareDriverNumber}
                onSelect={(n) => setCompareDriverNumber(n)}
                allowNone
              />
              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Lap</label>
                <select
                  className="w-full border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-[12px] text-[var(--foreground)] focus:border-[var(--ring)] focus:outline-none"
                  value={selectedLapNumber ?? ""}
                  onChange={(event) => setSelectedLapNumber(Number.parseInt(event.target.value, 10))}
                  disabled={primaryLaps.length === 0}
                >
                  <option value="">
                    {primaryLaps.length === 0 ? "No laps available" : "Select lap..."}
                  </option>
                  {primaryLaps.map((lap) => (
                    <option key={lap.lapNumber} value={lap.lapNumber}>
                      Lap {lap.lapNumber}
                      {lap.lapDurationMs ? ` - ${formatLapTimeFromMs(lap.lapDurationMs)}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          {selectedPrimaryDriver && selectedPrimaryLap ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <DriverLapCard
                  title="PRIMARY"
                  teamColor={primaryColor}
                  driverName={selectedPrimaryDriver.fullName}
                  teamName={selectedPrimaryDriver.teamName}
                  lap={selectedPrimaryLap}
                />
                {selectedCompareDriver ? (
                  <DriverLapCard
                    teamColor={`#${selectedCompareDriver.teamColor}`}
                    driverName={selectedCompareDriver.fullName}
                    teamName={selectedCompareDriver.teamName}
                    lap={selectedCompareLap}
                  />
                ) : null}
              </div>

              {primaryTrace.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
                  <div className="space-y-4 xl:col-span-3">
                    <TraceChart
                      title="Speed Trace"
                      icon={<TrendingUp className="size-3.5" />}
                      data={primaryTrace}
                      compareData={compareTrace}
                      dataKey="speed"
                      unit="km/h"
                      color={primaryColor}
                      compareColor={compareColor}
                      height={220}
                      hoverIndex={hoverIndex}
                      onHover={setHoverIndex}
                      driverName={selectedPrimaryDriver.nameAcronym}
                      compareDriverName={selectedCompareDriver?.nameAcronym}
                    />
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <TraceChart
                        title="Engine RPM"
                        icon={<Gauge className="size-3.5" />}
                        data={primaryTrace}
                        compareData={compareTrace}
                        dataKey="rpm"
                        unit="rpm"
                        color={primaryColor}
                        compareColor={compareColor}
                        height={160}
                        hoverIndex={hoverIndex}
                        onHover={setHoverIndex}
                        driverName={selectedPrimaryDriver.nameAcronym}
                        compareDriverName={selectedCompareDriver?.nameAcronym}
                      />
                      <TraceChart
                        title="Gear"
                        icon={<Activity className="size-3.5" />}
                        data={primaryTrace}
                        compareData={compareTrace}
                        dataKey="gear"
                        unit=""
                        color={primaryColor}
                        compareColor={compareColor}
                        height={160}
                        hoverIndex={hoverIndex}
                        onHover={setHoverIndex}
                        isGear
                        driverName={selectedPrimaryDriver.nameAcronym}
                        compareDriverName={selectedCompareDriver?.nameAcronym}
                      />
                    </div>
                    <Card>
                      <CardContent className="space-y-3 p-4">
                        <h3 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
                          <Zap className="size-3.5" />
                          Pedal Inputs
                        </h3>
                        <PedalTrace
                          label="Throttle"
                          data={primaryTrace}
                          dataKey="throttle"
                          color="#22c55e"
                          height={70}
                          hoverIndex={hoverIndex}
                          onHover={setHoverIndex}
                        />
                        <PedalTrace
                          label="Brake"
                          data={primaryTrace}
                          dataKey="brake"
                          color="#ef4444"
                          height={70}
                          hoverIndex={hoverIndex}
                          onHover={setHoverIndex}
                        />
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-4">
                    <Card>
                      <CardContent className="p-4">
                        <h3 className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
                          <Map className="size-3.5" />
                          Track Map
                        </h3>
                        <div className="aspect-square overflow-hidden border border-[var(--border)] bg-[var(--muted)]/30 p-2">
                          <TrackMap
                            points={mapPoints}
                            color={primaryColor}
                            hoverIndex={hoverIndex}
                            totalPoints={primaryTrace.length}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    {lapStats ? (
                      <Card>
                        <CardContent className="p-4">
                          <h3 className="mb-3 text-[11px] uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
                            Lap Statistics
                          </h3>
                          <div className="grid grid-cols-2 gap-2">
                            <StatTile label="Top Speed" value={lapStats.topSpeed} unit="km/h" />
                            <StatTile label="Avg Speed" value={lapStats.avgSpeed} unit="km/h" />
                            <StatTile label="Max RPM" value={lapStats.maxRpm.toLocaleString()} />
                            <StatTile label="Gear Changes" value={lapStats.gearChanges} />
                            <StatTile label="DRS Opens" value={lapStats.drsActivations} />
                            <StatTile label="Full Throttle" value={`${lapStats.fullThrottlePct}%`} />
                          </div>
                        </CardContent>
                      </Card>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center border border-dashed border-[var(--border)] bg-[var(--panel)]">
                  <div className="space-y-2 p-6 text-center">
                    <p className="text-[12px] font-medium text-[var(--foreground)]">No telemetry data available</p>
                    <p className="max-w-md text-[11px] text-[var(--muted-foreground)]">
                      This session or lap does not expose enough telemetry samples yet.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center border border-dashed border-[var(--border)] bg-[var(--panel)]">
              <div className="space-y-2 text-center">
                <Search className="mx-auto size-8 text-[var(--muted-foreground)]" />
                <p className="text-[12px] font-medium">Select a driver and lap to begin</p>
                <p className="text-[11px] text-[var(--muted-foreground)]">{meetingLabel}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
