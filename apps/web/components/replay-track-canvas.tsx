"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { TrackSurfaceModel } from "@/lib/session-insights";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSoftTeamColor, getSoftTeamColorRgba } from "@/lib/utils";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function interpolate(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

type Props = {
  model: TrackSurfaceModel | null;
  nextModel?: TrackSurfaceModel | null;
  interpolation?: number;
  isLoading?: boolean;
  viewMode?: "2d" | "3d";
  chrome?: boolean;
  title?: string;
  subtitle?: string;
  badgeLabel?: string;
  selectedDriver?: string | null;
  onSelectDriver?: (racingNumber: string | null) => void;
  interactive?: boolean;
};

type DriverRenderState = {
  xPercent: number;
  yPercent: number;
  targetXPercent: number;
  targetYPercent: number;
  marker: TrackSurfaceModel["markers"][number];
};

function projectPoint(
  xPercent: number,
  yPercent: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  size: { width: number; height: number },
  zoom = 1,
  panOffset = { x: 0, y: 0 },
) {
  const padding = 56;
  const innerWidth = Math.max(size.width - padding * 2, 1);
  const innerHeight = Math.max(size.height - padding * 2, 1);
  const widthSpan = Math.max(bounds.maxX - bounds.minX, 1);
  const heightSpan = Math.max(bounds.maxY - bounds.minY, 1);
  const scale =
    Math.min(
      (innerWidth / widthSpan) * 0.98,
      (innerHeight / heightSpan) * 0.98,
    ) * zoom;
  const offsetX = (size.width - widthSpan * scale) / 2 + panOffset.x;
  const offsetY = (size.height - heightSpan * scale) / 2 + panOffset.y;

  return {
    x: offsetX + (xPercent - bounds.minX) * scale,
    y: offsetY + (yPercent - bounds.minY) * scale,
  };
}

export function ReplayTrackCanvas({
  model,
  nextModel = null,
  interpolation = 0,
  isLoading = false,
  viewMode = "2d",
  chrome = true,
  title,
  subtitle,
  badgeLabel = "Stored replay path",
  selectedDriver = null,
  onSelectDriver,
  interactive = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number>(0);
  const latestRef = useRef({ model, nextModel, interpolation });
  const driverStatesRef = useRef<Map<string, DriverRenderState>>(new Map());
  const [size, setSize] = useState({ width: 900, height: 560 });
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOffsetStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    latestRef.current = { model, nextModel, interpolation };
  }, [interpolation, model, nextModel]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      setSize({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(260, Math.floor(entry.contentRect.height)),
      });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const draw = () => {
      const {
        model: currentModel,
        nextModel: upcomingModel,
        interpolation: progressRaw,
      } = latestRef.current;
      const dpr = Math.max(window.devicePixelRatio || 1, 2);
      canvas.width = size.width * dpr;
      canvas.height = size.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, size.width, size.height);

      if (!currentModel?.pathPoints?.length) {
        frameRef.current = window.requestAnimationFrame(draw);
        return;
      }

      ctx.fillStyle = "#090b10";
      ctx.fillRect(0, 0, size.width, size.height);
      const grid = ctx.createLinearGradient(0, 0, size.width, size.height);
      grid.addColorStop(0, "rgba(0,163,255,0.06)");
      grid.addColorStop(1, "rgba(255,255,255,0.01)");
      ctx.fillStyle = grid;
      ctx.fillRect(0, 0, size.width, size.height);

      const pathBounds = currentModel.pathPoints.reduce(
        (summary, point) => ({
          minX: Math.min(summary.minX, point.xPercent),
          maxX: Math.max(summary.maxX, point.xPercent),
          minY: Math.min(summary.minY, point.yPercent),
          maxY: Math.max(summary.maxY, point.yPercent),
        }),
        {
          minX: Number.POSITIVE_INFINITY,
          maxX: Number.NEGATIVE_INFINITY,
          minY: Number.POSITIVE_INFINITY,
          maxY: Number.NEGATIVE_INFINITY,
        },
      );
      const points = currentModel.pathPoints.map((point) => ({
        ...projectPoint(
          point.xPercent,
          point.yPercent,
          pathBounds,
          size,
          zoom,
          panOffset,
        ),
      }));

      ctx.strokeStyle = "rgba(0,0,0,0.92)";
      ctx.lineWidth = 42;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();

      ctx.strokeStyle = "rgba(0, 191, 255, 0.16)";
      ctx.lineWidth = 32;
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();

      ctx.strokeStyle = "rgba(255,255,255,0.42)";
      ctx.lineWidth = 22;
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();

      ctx.strokeStyle = "#f8fbff";
      ctx.lineWidth = 10;
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();

      ctx.strokeStyle = "rgba(7, 15, 24, 0.55)";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 12]);
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      const start = points[0];
      if (start) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(start.x, start.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(start.x, start.y, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.98)";
        ctx.fillRect(start.x - 18, start.y - 36, 18, 10);
        ctx.fillStyle = "rgba(10,10,12,0.96)";
        ctx.fillRect(start.x, start.y - 36, 18, 10);
      }

      const progress = clamp(progressRaw, 0, 1);
      const nextMarkerMap = new Map(
        (upcomingModel?.markers ?? []).map((marker) => [
          marker.racingNumber,
          marker,
        ]),
      );
      const states = driverStatesRef.current;

      for (const marker of currentModel.markers) {
        if (marker.xPercent === undefined || marker.yPercent === undefined) {
          continue;
        }

        const nextMarker = nextMarkerMap.get(marker.racingNumber);
        const targetXPercent =
          nextMarker?.xPercent !== undefined
            ? interpolate(marker.xPercent, nextMarker.xPercent, progress)
            : marker.xPercent;
        const targetYPercent =
          nextMarker?.yPercent !== undefined
            ? interpolate(marker.yPercent, nextMarker.yPercent, progress)
            : marker.yPercent;

        const existing = states.get(marker.racingNumber);
        if (existing) {
          existing.targetXPercent = targetXPercent;
          existing.targetYPercent = targetYPercent;
          existing.marker = marker;
          existing.xPercent = interpolate(
            existing.xPercent,
            targetXPercent,
            0.28,
          );
          existing.yPercent = interpolate(
            existing.yPercent,
            targetYPercent,
            0.28,
          );
        } else {
          states.set(marker.racingNumber, {
            xPercent: targetXPercent,
            yPercent: targetYPercent,
            targetXPercent,
            targetYPercent,
            marker,
          });
        }
      }

      for (const [racingNumber, state] of [...states.entries()]) {
        if (
          !currentModel.markers.some(
            (marker) => marker.racingNumber === racingNumber,
          )
        ) {
          states.delete(racingNumber);
        }
      }

      for (const state of states.values()) {
        const { x, y } = projectPoint(
          state.xPercent,
          state.yPercent,
          pathBounds,
          size,
          zoom,
          panOffset,
        );
        const radius = 7;
        const isSelected = state.marker.racingNumber === selectedDriver;

        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.beginPath();
        ctx.arc(x, y, isSelected ? radius + 10 : radius + 6, 0, Math.PI * 2);
        ctx.fill();

        const teamColor = getSoftTeamColor(state.marker.teamColor);

        ctx.fillStyle = teamColor;
        ctx.beginPath();
        ctx.arc(x, y, isSelected ? radius + 2 : radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(255,255,255,0.96)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, isSelected ? radius + 2 : radius, 0, Math.PI * 2);
        ctx.stroke();
        if (isSelected) {
          ctx.strokeStyle = getSoftTeamColorRgba(state.marker.teamColor, 0.98);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.font = "700 10px ui-sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(
          state.marker.shortCode ?? state.marker.racingNumber,
          x,
          y - 14,
        );
      }

      frameRef.current = window.requestAnimationFrame(draw);
    };

    frameRef.current = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frameRef.current);
  }, [
    model?.pathPoints?.length,
    panOffset,
    selectedDriver,
    size.height,
    size.width,
    zoom,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !interactive) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      setZoom((current) => clamp(current * factor, 0.6, 6));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [interactive]);

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive || event.button !== 0) return;
    setIsPanning(true);
    panStartRef.current = { x: event.clientX, y: event.clientY };
    panOffsetStartRef.current = panOffset;
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive || !isPanning) return;
    setPanOffset({
      x: panOffsetStartRef.current.x + (event.clientX - panStartRef.current.x),
      y: panOffsetStartRef.current.y + (event.clientY - panStartRef.current.y),
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive || !onSelectDriver || !model?.pathPoints?.length) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    const pathBounds = model.pathPoints.reduce(
      (summary, point) => ({
        minX: Math.min(summary.minX, point.xPercent),
        maxX: Math.max(summary.maxX, point.xPercent),
        minY: Math.min(summary.minY, point.yPercent),
        maxY: Math.max(summary.maxY, point.yPercent),
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      },
    );
    let winner: { id: string; dist: number } | null = null;
    for (const [racingNumber, state] of driverStatesRef.current.entries()) {
      const point = projectPoint(
        state.xPercent,
        state.yPercent,
        pathBounds,
        size,
        zoom,
        panOffset,
      );
      const dist = Math.hypot(clickX - point.x, clickY - point.y);
      if (dist < 20 && (!winner || dist < winner.dist))
        winner = { id: racingNumber, dist };
    }
    onSelectDriver(winner ? winner.id : null);
  };

  if (!model?.pathPoints?.length) {
    const fallbackContent = (
      <Card>
        <CardHeader>
          <CardTitle>Track surface unavailable</CardTitle>
          <CardDescription>
            {isLoading
              ? "Loading replay track data..."
              : "No circuit or timing snapshot is available for this session yet."}
          </CardDescription>
        </CardHeader>
        {isLoading ? (
          <CardContent>
            <Skeleton className="aspect-[16/10] min-h-[28rem] w-full" />
          </CardContent>
        ) : null}
      </Card>
    );

    if (chrome) {
      return fallbackContent;
    }

    return (
      <div className="border border-[var(--border)] bg-[var(--panel)] p-4 text-[var(--foreground)]">
        <div className="text-[12px] font-semibold uppercase tracking-[0.06em]">Track surface unavailable</div>
        <div className="mt-1 text-[11px] text-[var(--muted-foreground)]">
          {isLoading
            ? "Loading replay track data..."
            : "No circuit or timing snapshot is available for this session yet."}
        </div>
        {isLoading ? (
          <Skeleton className="mt-3 aspect-[16/10] min-h-[28rem] w-full" />
        ) : null}
      </div>
    );
  }

  const frameTitle = title ?? model.title;
  const frameSubtitle = subtitle ?? model.subtitle;

  if (!chrome) {
    return (
      <div className="overflow-hidden border border-[var(--border)] bg-[var(--panel)]">
        <div
          ref={containerRef}
          className="relative aspect-[16/10] min-h-[28rem] overflow-hidden bg-[#090b10]"
        >
          <div
            className={`h-full w-full origin-center transition-transform duration-300 ${
              viewMode === "3d"
                ? "scale-[0.94] [transform:perspective(1600px)_rotateX(58deg)_rotateZ(-22deg)]"
                : "scale-100 [transform:none]"
            }`}
          >
            <canvas
              ref={canvasRef}
              className={`h-full w-full ${interactive ? "cursor-crosshair" : ""}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={handleClick}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>{frameTitle}</CardTitle>
            <CardDescription>{frameSubtitle}</CardDescription>
          </div>
          <span className="border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            {badgeLabel}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="relative aspect-[16/10] min-h-[28rem] overflow-hidden border border-[var(--border)] bg-[#090b10]"
        >
          <div
            className={`h-full w-full origin-center transition-transform duration-300 ${
              viewMode === "3d"
                ? "scale-[0.94] [transform:perspective(1600px)_rotateX(58deg)_rotateZ(-22deg)]"
                : "scale-100 [transform:none]"
            }`}
          >
            <canvas
              ref={canvasRef}
              className={`h-full w-full ${interactive ? "cursor-crosshair" : ""}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={handleClick}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
