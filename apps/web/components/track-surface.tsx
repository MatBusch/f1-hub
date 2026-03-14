"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Expand,
  Minimize,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  TimerReset,
} from "lucide-react";

import NumberFlow from "@number-flow/react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSoftTeamColor, getSoftTeamColorRgba } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { type TrackSurfaceModel } from "@/lib/session-insights";

type MarkerLayout = TrackSurfaceModel["markers"][number] & {
  left: number;
  top: number;
};

export type ReplayControls = {
  activeTimestampLabel: string;
  elapsedLabel: string;
  durationLabel: string;
  rangeMax: number;
  rangeValue: number;
  rangeStartLabel: string;
  rangeEndLabel: string;
  isPlaying: boolean;
  canStepBackward: boolean;
  canStepForward: boolean;
  onStepBackward: () => void;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onSeek: (value: number) => void;
  onJumpBack: () => void;
  onJumpForward: () => void;
  speedLabel?: string;
  onCycleSpeed?: () => void;
  viewMode?: "2d" | "3d";
  onToggleViewMode?: () => void;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
};

function getMarkerSvgPosition(
  marker: Pick<MarkerLayout, "left" | "top">,
  dimensions: { width: number; height: number },
) {
  return {
    x: (marker.left / 100) * dimensions.width,
    y: (marker.top / 100) * dimensions.height,
  };
}

function projectPointToPolyline(
  point: { x: number; y: number },
  polyline: { points: Array<{ x: number; y: number }> },
) {
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  let bestPoint = point;

  for (let index = 1; index < polyline.points.length; index += 1) {
    const start = polyline.points[index - 1]!;
    const end = polyline.points[index]!;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLengthSquared = dx * dx + dy * dy;

    if (segmentLengthSquared <= 0) {
      continue;
    }

    const projection =
      ((point.x - start.x) * dx + (point.y - start.y) * dy) /
      segmentLengthSquared;
    const clampedProjection = Math.min(1, Math.max(0, projection));
    const projectedPoint = {
      x: start.x + dx * clampedProjection,
      y: start.y + dy * clampedProjection,
    };
    const distanceSquared =
      (point.x - projectedPoint.x) * (point.x - projectedPoint.x) +
      (point.y - projectedPoint.y) * (point.y - projectedPoint.y);

    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      bestPoint = projectedPoint;
    }
  }

  return bestPoint;
}

export function TrackSurface({
  model,
  replayControls,
}: {
  model: TrackSurfaceModel | null;
  replayControls?: ReplayControls | null;
}) {
  const pathRef = useRef<SVGPathElement | null>(null);
  const [markerLayout, setMarkerLayout] = useState<MarkerLayout[]>([]);
  const [smoothedMarkerLayout, setSmoothedMarkerLayout] = useState<
    MarkerLayout[]
  >([]);
  const [animatedMarkerLayout, setAnimatedMarkerLayout] = useState<
    MarkerLayout[]
  >([]);
  const coordinateStartPoint = model?.pathPoints?.[0] ?? null;
  const coordinatePolyline = useMemo(() => {
    if (
      !model ||
      model.layout !== "coordinate-map" ||
      !model.pathPoints?.length
    ) {
      return null;
    }

    const points = model.pathPoints.map((point) => ({
      x: (point.xPercent / 100) * 1000,
      y: (point.yPercent / 100) * 700,
    }));
    const cumulativeLengths = [0];
    let totalLength = 0;

    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1]!;
      const current = points[index]!;
      totalLength += Math.hypot(current.x - previous.x, current.y - previous.y);
      cumulativeLengths.push(totalLength);
    }

    return { points, cumulativeLengths, totalLength };
  }, [model]);
  const coordinatePath = useMemo(() => {
    if (
      !model ||
      model.layout !== "coordinate-map" ||
      !model.pathPoints?.length
    ) {
      return "";
    }

    return model.pathPoints
      .map((point, index) => {
        const x = (point.xPercent / 100) * 1000;
        const y = (point.yPercent / 100) * 700;
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }, [model]);

  useEffect(() => {
    if (!model) {
      setMarkerLayout([]);
      return;
    }

    if (model.layout === "coordinate-map") {
      setMarkerLayout(
        model.markers.map((marker) => {
          if (
            coordinatePolyline &&
            marker.xPercent !== undefined &&
            marker.yPercent !== undefined
          ) {
            const projectedPoint = projectPointToPolyline(
              {
                x: (marker.xPercent / 100) * 1000,
                y: (marker.yPercent / 100) * 700,
              },
              coordinatePolyline,
            );

            return {
              ...marker,
              left: (projectedPoint.x / 1000) * 100,
              top: (projectedPoint.y / 700) * 100,
            };
          }

          return {
            ...marker,
            left: marker.xPercent ?? 50,
            top: marker.yPercent ?? 50,
          };
        }),
      );
      return;
    }

    if (!pathRef.current || !model.circuit) {
      setMarkerLayout([]);
      return;
    }

    const path = pathRef.current;
    const circuit = model.circuit;
    const totalLength = path.getTotalLength();

    setMarkerLayout(
      model.markers.map((marker) => {
        const point = path.getPointAtLength(
          totalLength * (marker.progress ?? 0),
        );

        return {
          ...marker,
          left: (point.x / circuit.viewBox.width) * 100,
          top: (point.y / circuit.viewBox.height) * 100,
        };
      }),
    );
  }, [coordinatePolyline, model]);

  useEffect(() => {
    if (markerLayout.length === 0) {
      setSmoothedMarkerLayout([]);
      return;
    }

    if (!replayControls?.isPlaying) {
      setSmoothedMarkerLayout(markerLayout);
      return;
    }

    setSmoothedMarkerLayout((previousLayout) => {
      if (previousLayout.length === 0) {
        return markerLayout;
      }

      const previousByNumber = new Map(
        previousLayout.map((marker) => [marker.racingNumber, marker] as const),
      );

      return markerLayout.map((marker) => {
        const previousMarker = previousByNumber.get(marker.racingNumber);

        if (!previousMarker) {
          return marker;
        }

        return {
          ...marker,
          left: previousMarker.left * 0.42 + marker.left * 0.58,
          top: previousMarker.top * 0.42 + marker.top * 0.58,
        };
      });
    });
  }, [markerLayout, replayControls?.isPlaying]);

  useEffect(() => {
    if (smoothedMarkerLayout.length === 0) {
      setAnimatedMarkerLayout([]);
      return;
    }

    let frameId = 0;
    const animationDurationMs = replayControls?.isPlaying ? 210 : 90;
    const animationStartMs = performance.now();

    setAnimatedMarkerLayout((previousLayout) => {
      if (previousLayout.length === 0) {
        return smoothedMarkerLayout;
      }

      const previousByNumber = new Map(
        previousLayout.map((marker) => [marker.racingNumber, marker] as const),
      );

      const animate = (now: number) => {
        const progress = Math.min(
          1,
          (now - animationStartMs) / animationDurationMs,
        );
        const easedProgress = 1 - (1 - progress) * (1 - progress);

        setAnimatedMarkerLayout(
          smoothedMarkerLayout.map((marker) => {
            const previousMarker = previousByNumber.get(marker.racingNumber);

            if (!previousMarker) {
              return marker;
            }

            return {
              ...marker,
              left:
                previousMarker.left +
                (marker.left - previousMarker.left) * easedProgress,
              top:
                previousMarker.top +
                (marker.top - previousMarker.top) * easedProgress,
            };
          }),
        );

        if (progress < 1) {
          frameId = window.requestAnimationFrame(animate);
        }
      };

      frameId = window.requestAnimationFrame(animate);
      return previousLayout;
    });

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [replayControls?.isPlaying, smoothedMarkerLayout]);

  const renderMarkerLayout =
    animatedMarkerLayout.length > 0
      ? animatedMarkerLayout
      : smoothedMarkerLayout.length > 0
        ? smoothedMarkerLayout
        : markerLayout;
  const leaderRail = useMemo(
    () => renderMarkerLayout.slice(0, 8),
    [renderMarkerLayout],
  );
  const svgDimensions = useMemo(
    () =>
      model?.layout === "coordinate-map"
        ? { width: 1000, height: 700 }
        : {
            width: model?.circuit?.viewBox.width ?? 1000,
            height: model?.circuit?.viewBox.height ?? 700,
          },
    [model],
  );
  const is3dMode = replayControls?.viewMode === "3d";

  if (!model) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Track surface unavailable</CardTitle>
          <CardDescription>
            No circuit or timing snapshot is available for this session yet.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{model.title}</CardTitle>
            <CardDescription>{model.subtitle}</CardDescription>
          </div>
          <span
            className={`border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
              model.mode === "position-live"
                ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--muted-foreground)]"
            }`}
          >
            {model.mode === "position-live"
              ? "Live position packets"
              : model.mode === "historical-position"
                ? "Stored replay path"
                : "Classification estimate"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="relative overflow-hidden border border-[var(--border)] bg-[var(--background)] p-3 text-[var(--foreground)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            <div className="flex flex-wrap gap-2">
              <span className="border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                Circuit map
              </span>
              <span className="border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                {model.currentLap != null ? <NumberFlow value={model.currentLap} /> : "--"}/{model.totalLaps != null ? <NumberFlow value={model.totalLaps} /> : "--"} laps
              </span>
              {replayControls?.viewMode ? (
                <span className="border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                  {replayControls.viewMode.toUpperCase()} view
                </span>
              ) : null}
            </div>
            {replayControls ? (
              <div className="flex flex-wrap gap-2">
                {replayControls.onToggleViewMode ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={replayControls.onToggleViewMode}
                  >
                    {replayControls.viewMode === "3d" ? "2D" : "3D"}
                  </Button>
                ) : null}
                {replayControls.onCycleSpeed ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={replayControls.onCycleSpeed}
                  >
                    <TimerReset className="size-4" />
                    {replayControls.speedLabel ?? "1.0x"}
                  </Button>
                ) : null}
                {replayControls.onToggleExpanded ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={replayControls.onToggleExpanded}
                  >
                    {replayControls.isExpanded ? (
                      <>
                        <Minimize className="size-4" />
                        Collapse
                      </>
                    ) : (
                      <>
                        <Expand className="size-4" />
                        Expand
                      </>
                    )}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div
            className={`relative aspect-[16/10] border border-[var(--border)] bg-[#090b10] [perspective:1600px] ${is3dMode ? "overflow-visible" : ""}`}
          >
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_96%,var(--grid-line)_100%),linear-gradient(90deg,transparent_96%,var(--grid-line)_100%)] bg-[size:28px_28px] opacity-25" />
            <div
              className={`absolute inset-0 transition-transform duration-500 ${is3dMode ? "scale-[0.96] rotate-x-[58deg] rotate-z-[-22deg] translate-y-[-2%]" : ""}`}
            >
              <svg
                viewBox={
                  model.layout === "coordinate-map"
                    ? "0 0 1000 700"
                    : `0 0 ${model.circuit?.viewBox.width ?? 1000} ${model.circuit?.viewBox.height ?? 700}`
                }
                className="absolute inset-0 h-full w-full"
                role="img"
                aria-label={`${model.title} track map`}
              >
                {model.layout === "coordinate-map" ? (
                  <>
                    <path
                      d={coordinatePath}
                      fill="none"
                      stroke="rgba(0,0,0,0.88)"
                      opacity="0.9"
                      strokeWidth="44"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={coordinatePath}
                      fill="none"
                      stroke="rgba(255,255,255,0.22)"
                      opacity="1"
                      strokeWidth="24"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={coordinatePath}
                      fill="none"
                      stroke="white"
                      opacity="0.98"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={coordinatePath}
                      fill="none"
                      stroke="rgba(255,255,255,0.22)"
                      opacity="0.9"
                      strokeWidth="3"
                      strokeDasharray="10 14"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {coordinateStartPoint ? (
                      <>
                        <circle
                          cx={(coordinateStartPoint.xPercent / 100) * 1000}
                          cy={(coordinateStartPoint.yPercent / 100) * 700}
                          r="10"
                          fill="white"
                          opacity="0.95"
                        />
                        <circle
                          cx={(coordinateStartPoint.xPercent / 100) * 1000}
                          cy={(coordinateStartPoint.yPercent / 100) * 700}
                          r="22"
                          fill="none"
                          stroke="rgba(255,255,255,0.45)"
                          opacity="1"
                          strokeWidth="4"
                        />
                        <g
                          transform={`translate(${(coordinateStartPoint.xPercent / 100) * 1000} ${(coordinateStartPoint.yPercent / 100) * 700})`}
                        >
                          <rect
                            x="-16"
                            y="-34"
                            width="32"
                            height="10"
                            rx="4"
                            fill="rgba(255,255,255,0.94)"
                          />
                          <rect
                            x="-16"
                            y="-34"
                            width="16"
                            height="10"
                            rx="4"
                            fill="rgba(15,15,18,0.92)"
                          />
                          <rect
                            x="0"
                            y="-34"
                            width="16"
                            height="10"
                            rx="4"
                            fill="rgba(255,255,255,0.94)"
                          />
                        </g>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <path
                      d={model.circuit?.path ?? ""}
                      fill="none"
                      stroke="rgba(0,0,0,0.86)"
                      opacity="1"
                      strokeWidth="42"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      ref={pathRef}
                      d={model.circuit?.path ?? ""}
                      fill="none"
                      stroke="white"
                      opacity="0.98"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={model.circuit?.path ?? ""}
                      fill="none"
                      stroke="rgba(255,255,255,0.22)"
                      opacity="0.92"
                      strokeWidth="3"
                      strokeDasharray="10 14"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <line
                      x1={model.circuit?.startFinish.x1 ?? 0}
                      y1={model.circuit?.startFinish.y1 ?? 0}
                      x2={model.circuit?.startFinish.x2 ?? 0}
                      y2={model.circuit?.startFinish.y2 ?? 0}
                      stroke="white"
                      strokeWidth="6"
                      strokeDasharray="10 8"
                      strokeLinecap="round"
                    />
                  </>
                )}
                {renderMarkerLayout.map((marker) => {
                  const markerPosition = getMarkerSvgPosition(
                    marker,
                    svgDimensions,
                  );
                  const radius = marker.position <= 3 ? 7 : 5;

                  return (
                    <g
                      key={`track-marker-${marker.racingNumber}`}
                      transform={`translate(${markerPosition.x} ${markerPosition.y})`}
                    >
                      <circle
                        cx="0"
                        cy="0"
                        r={radius + 7}
                        fill="rgba(15, 15, 18, 0.5)"
                      />
                      <circle
                        cx="0"
                        cy="0"
                        r={radius + 1}
                        fill={getSoftTeamColor(marker.teamColor)}
                        stroke="rgba(255,255,255,0.92)"
                        strokeWidth="2.2"
                      />
                      <text
                        x="0"
                        y={radius <= 6 ? -12 : -14}
                        textAnchor="middle"
                        fill="white"
                        fontSize="10"
                        fontWeight="700"
                      >
                        {marker.shortCode ?? marker.racingNumber}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            {is3dMode ? (
              <div className="pointer-events-none absolute inset-x-[10%] bottom-[-7%] h-[18%] bg-[color-mix(in_oklab,var(--foreground),transparent_85%)] blur-2xl" />
            ) : null}
          </div>

          <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
            {model.mode === "position-live"
              ? "Markers are plotted from Tinybird-backed live position frames."
              : model.mode === "historical-position"
                ? "Markers and track outline are plotted from stored historical track frames in Tinybird."
                : "This session has no stored track frames yet, so marker order is inferred from the latest timing snapshot."}
          </p>

          {replayControls ? (
            <div className="mt-3 space-y-2 border border-[var(--border)] bg-[var(--panel)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    Replay transport
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                    {replayControls.activeTimestampLabel}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={replayControls.onStepBackward}
                    disabled={!replayControls.canStepBackward}
                  >
                    <SkipBack className="size-4" />
                  </Button>
                  <Button
                    variant="default"
                    onClick={replayControls.onTogglePlay}
                    disabled={replayControls.rangeMax <= 0}
                  >
                    {replayControls.isPlaying ? (
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
                    onClick={replayControls.onStepForward}
                    disabled={!replayControls.canStepForward}
                  >
                    <SkipForward className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  <span>Timeline</span>
                  <span>
                    {replayControls.elapsedLabel} /{" "}
                    {replayControls.durationLabel}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(replayControls.rangeMax, 0)}
                  step={1}
                  value={replayControls.rangeValue}
                  onChange={(event) =>
                    replayControls.onSeek(
                      Number.parseInt(event.target.value, 10),
                    )
                  }
                  className="w-full accent-[var(--primary)]"
                />
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]">
                  <span>{replayControls.rangeStartLabel}</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={replayControls.onJumpBack}
                      disabled={!replayControls.canStepBackward}
                    >
                      -15s
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={replayControls.onJumpForward}
                      disabled={!replayControls.canStepForward}
                    >
                      +15s
                    </Button>
                  </div>
                  <span>{replayControls.rangeEndLabel}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-1">
          {leaderRail.map((marker) => (
            <div
              key={`rail-${marker.racingNumber}`}
              className="grid grid-cols-[48px_36px_1fr_auto] items-center gap-2 border border-[var(--border)] bg-[var(--panel)] px-2.5 py-2"
            >
              <div
                className="flex w-12 shrink-0 items-center justify-center text-[11px] font-semibold text-[var(--primary-foreground)]"
                style={{ backgroundColor: getSoftTeamColor(marker.teamColor) }}
              >
                P<NumberFlow value={marker.position} />
              </div>
              <div className="relative size-9 overflow-hidden border border-[var(--border)] bg-[var(--panel-elevated)]">
                {marker.headshotUrl ? (
                  <img
                    src={marker.headshotUrl}
                    alt={marker.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase text-[var(--workspace-inverse)]"
                    style={{
                      backgroundColor: getSoftTeamColorRgba(
                        marker.teamColor,
                        0.92,
                      ),
                    }}
                  >
                    {marker.shortCode}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{marker.name}</div>
                <div className="truncate text-[11px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                  #{marker.racingNumber} {marker.teamName}
                </div>
              </div>
              <div className="min-w-[132px] text-right">
                <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                  {marker.currentCompound ?? "--"}
                </div>
                <div className="font-mono text-xs text-[var(--foreground)]">
                  {marker.gapToLeader ?? "--"}
                </div>
                <div className="font-mono text-xs text-[var(--muted-foreground)]">
                  {marker.lastLapTime ?? "--"}
                </div>
                <div className="font-mono text-[11px] text-[var(--muted-foreground)]">
                  Best {marker.bestLapTime ?? "--"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
