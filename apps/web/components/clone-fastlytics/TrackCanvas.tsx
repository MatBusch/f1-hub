"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ReplayFrame, ReplayTrack } from "@/lib/clone-replay-api";

interface TrackCanvasProps {
  track: ReplayTrack;
  currentFrame: ReplayFrame | null;
  nextFrame?: ReplayFrame | null;
  currentTime?: number;
  driverColors: Record<string, string>;
  selectedDriver: string | null;
  onSelectDriver: (abbr: string | null) => void;
}

interface DriverRenderState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
}

export function TrackCanvas({
  track,
  currentFrame,
  nextFrame,
  currentTime = 0,
  driverColors,
  selectedDriver,
  onSelectDriver,
}: TrackCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const driverStatesRef = useRef<Map<string, DriverRenderState>>(new Map());
  const timeInfoRef = useRef({ currentFrame, nextFrame, currentTime });
  const rafRef = useRef<number>(0);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOffsetStartRef = useRef({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    timeInfoRef.current = { currentFrame, nextFrame, currentTime };
  }, [currentFrame, nextFrame, currentTime]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const getTransform = useCallback(() => {
    const padding = 60;
    const availW = canvasSize.width - padding * 2;
    const availH = canvasSize.height - padding * 2;
    const trackRange = Math.max(Math.max(...track.x) - Math.min(...track.x), Math.max(...track.y) - Math.min(...track.y)) || 1;
    const scale = (Math.min(availW, availH) / trackRange) * zoom;
    const centerX = canvasSize.width / 2 + panOffset.x;
    const centerY = canvasSize.height / 2 + panOffset.y;
    const trackCenterX = (Math.min(...track.x) + Math.max(...track.x)) / 2;
    const trackCenterY = (Math.min(...track.y) + Math.max(...track.y)) / 2;
    return {
      toCanvasX: (nx: number) => centerX + (nx - trackCenterX) * scale,
      toCanvasY: (ny: number) => centerY - (ny - trackCenterY) * scale,
      scale,
    };
  }, [canvasSize, panOffset, track, zoom]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
    if (!track.x.length) return;
    const { toCanvasX, toCanvasY, scale } = getTransform();
    ctx.beginPath();
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = Math.max(2, scale * 0.008);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < track.x.length; i += 1) {
      const cx = toCanvasX(track.x[i] ?? 0);
      const cy = toCanvasY(track.y[i] ?? 0);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.closePath();
    ctx.stroke();
    const { currentFrame: cFrame, nextFrame: nFrame, currentTime: cTime } = timeInfoRef.current;
    if (!cFrame) {
      rafRef.current = requestAnimationFrame(render);
      return;
    }
    let t = 0;
    if (nFrame && nFrame.timestamp > cFrame.timestamp) {
      t = (cTime - cFrame.timestamp) / (nFrame.timestamp - cFrame.timestamp);
      t = Math.max(0, Math.min(1, t));
    }
    const nDrivers = new Map(nFrame?.drivers.map((d) => [d.abbr, d] as const));
    const states = driverStatesRef.current;
    const dotRadius = Math.max(4, Math.min(8, scale * 0.005));
    const fontSize = Math.max(8, Math.min(11, scale * 0.004));
    const sortedDrivers = [...cFrame.drivers].sort((a, b) => {
      if (a.abbr === selectedDriver) return 1;
      if (b.abbr === selectedDriver) return -1;
      return 0;
    });
    for (const drv of sortedDrivers) {
      if (drv.retired) continue;
      const nDrv = nDrivers.get(drv.abbr);
      let x = drv.x;
      let y = drv.y;
      if (nDrv && !nDrv.retired) {
        x = x + (nDrv.x - x) * t;
        y = y + (nDrv.y - y) * t;
      }
      const existing = states.get(drv.abbr);
      if (existing) {
        existing.x = x;
        existing.y = y;
      } else {
        states.set(drv.abbr, { x, y, targetX: x, targetY: y });
      }
      const cx = toCanvasX(x);
      const cy = toCanvasY(y);
      const color = driverColors[drv.abbr] || "#888";
      const isSelected = drv.abbr === selectedDriver;
      ctx.beginPath();
      ctx.arc(cx, cy, isSelected ? dotRadius * 1.4 : dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(cx, cy, dotRadius * 2.2, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.4;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (drv.in_pit) {
        ctx.beginPath();
        ctx.arc(cx, cy, dotRadius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = "#FFD700";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const labelY = cy - dotRadius - 3;
      const textWidth = ctx.measureText(drv.abbr).width;
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(cx - textWidth / 2 - 2, labelY - fontSize, textWidth + 4, fontSize + 2);
      ctx.fillStyle = isSelected ? "#fff" : "#ccc";
      ctx.fillText(drv.abbr, cx, labelY);
      if (drv.has_fastest_lap) {
        ctx.beginPath();
        ctx.arc(cx + dotRadius + 3, cy - dotRadius, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#A020F0";
        ctx.fill();
      }
    }
    rafRef.current = requestAnimationFrame(render);
  }, [canvasSize, driverColors, getTransform, selectedDriver, track]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [render]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const normalizedDelta = e.deltaY / 100;
    const zoomFactor = 1 - normalizedDelta * 0.2;
    setZoom((prev) => Math.max(0.3, Math.min(8, prev * zoomFactor)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY };
      panOffsetStartRef.current = { ...panOffset };
    }
  }, [panOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    const maxPanX = canvasSize.width / 2;
    const maxPanY = canvasSize.height / 2;
    setPanOffset({
      x: Math.max(-maxPanX, Math.min(maxPanX, panOffsetStartRef.current.x + dx)),
      y: Math.max(-maxPanY, Math.min(maxPanY, panOffsetStartRef.current.y + dy)),
    });
  }, [canvasSize, isPanning]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const { currentFrame: cFrame } = timeInfoRef.current;
    if (!cFrame || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const { toCanvasX, toCanvasY } = getTransform();
    const states = driverStatesRef.current;
    let closestDriver: string | null = null;
    let closestDist = Infinity;
    for (const drv of cFrame.drivers) {
      const state = states.get(drv.abbr);
      if (!state || drv.retired) continue;
      const cx = toCanvasX(state.x);
      const cy = toCanvasY(state.y);
      const dist = Math.sqrt((clickX - cx) ** 2 + (clickY - cy) ** 2);
      if (dist < 20 && dist < closestDist) {
        closestDist = dist;
        closestDriver = drv.abbr;
      }
    }
    onSelectDriver(closestDriver === selectedDriver ? null : closestDriver);
  }, [getTransform, onSelectDriver, selectedDriver]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden cursor-crosshair" style={{ touchAction: "none" }}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
      />
    </div>
  );
}
