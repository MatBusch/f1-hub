"use client";

import { useEffect } from "react";
import { create } from "zustand";

import {
  fetchLiveWindow,
  fetchRaceControl,
  fetchSessionBoot,
  fetchSessionDrivers,
  fetchSessionSummary,
  fetchTrackLatestPositions,
  fetchTrackOutline,
} from "@/lib/api";
import type {
  LiveEnvelope,
  RaceControlMessage,
  SessionBoot,
  SessionDriver,
  SessionSummary,
  TrackOutlinePoint,
  TrackPositionFrame,
} from "@f1-hub/contracts";

const LIVE_WINDOW_CAP = 120;

type LiveSessionStore = {
  sessionKey: number | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  summary: SessionSummary | null;
  boot: SessionBoot | null;
  liveWindow: LiveEnvelope[];
  raceControl: RaceControlMessage[];
  sessionDrivers: SessionDriver[];
  latestTrackPositions: TrackPositionFrame[];
  outlinePoints: TrackOutlinePoint[];
  lastSequence: number;
  hydratedAt: string | null;
  transport: "idle" | "bootstrap" | "sse" | "fallback-poll";
  isPolling: boolean;
  reset: (sessionKey: number | null) => void;
  setBootstrap: (input: {
    summary: SessionSummary;
    boot: SessionBoot;
    liveWindow: LiveEnvelope[];
    raceControl: RaceControlMessage[];
    sessionDrivers: SessionDriver[];
    latestTrackPositions: TrackPositionFrame[];
    outlinePoints: TrackOutlinePoint[];
  }) => void;
  applyPollUpdate: (input: {
    summary: SessionSummary;
    boot: SessionBoot;
    liveWindow: LiveEnvelope[];
    raceControl: RaceControlMessage[];
    latestTrackPositions: TrackPositionFrame[];
  }) => void;
  setError: (message: string) => void;
  setPolling: (value: boolean) => void;
};

function mergeEnvelopes(existing: LiveEnvelope[], incoming: LiveEnvelope[]) {
  if (incoming.length === 0) {
    return existing;
  }

  const bySequence = new Map<number, LiveEnvelope>();

  for (const envelope of existing) {
    bySequence.set(envelope.sequence, envelope);
  }

  for (const envelope of incoming) {
    bySequence.set(envelope.sequence, envelope);
  }

  return [...bySequence.values()]
    .sort((left, right) => left.sequence - right.sequence)
    .slice(-LIVE_WINDOW_CAP);
}

export const useLiveSessionStore = create<LiveSessionStore>((set) => ({
  sessionKey: null,
  status: "idle",
  error: null,
  summary: null,
  boot: null,
  liveWindow: [],
  raceControl: [],
  sessionDrivers: [],
  latestTrackPositions: [],
  outlinePoints: [],
  lastSequence: 0,
  hydratedAt: null,
  transport: "idle",
  isPolling: false,
  reset: (sessionKey) =>
    set({
      sessionKey,
      status: sessionKey === null ? "idle" : "loading",
      error: null,
      summary: null,
      boot: null,
      liveWindow: [],
      raceControl: [],
      sessionDrivers: [],
      latestTrackPositions: [],
      outlinePoints: [],
      lastSequence: 0,
      hydratedAt: null,
      transport: sessionKey === null ? "idle" : "bootstrap",
      isPolling: false,
    }),
  setBootstrap: (input) =>
    set((state) => ({
      ...state,
      status: "ready",
      error: null,
      summary: input.summary,
      boot: input.boot,
      liveWindow: mergeEnvelopes([], input.liveWindow),
      raceControl: input.raceControl,
      sessionDrivers: input.sessionDrivers,
      latestTrackPositions: input.latestTrackPositions,
      outlinePoints: input.outlinePoints,
      lastSequence:
        input.liveWindow[input.liveWindow.length - 1]?.sequence ??
        input.summary.lastSequence,
      hydratedAt: new Date().toISOString(),
      transport: "bootstrap",
      isPolling: false,
    })),
  applyPollUpdate: (input) =>
    set((state) => {
      const liveWindow = mergeEnvelopes(state.liveWindow, input.liveWindow);

      return {
        ...state,
        status: "ready",
        error: null,
        summary: input.summary,
        boot: input.boot,
        liveWindow,
        raceControl: input.raceControl,
        latestTrackPositions: input.latestTrackPositions,
        lastSequence:
          liveWindow[liveWindow.length - 1]?.sequence ?? input.summary.lastSequence,
        hydratedAt: new Date().toISOString(),
        transport: state.transport === "sse" ? "sse" : "fallback-poll",
        isPolling: false,
      };
    }),
  setError: (message) =>
    set((state) => ({
      ...state,
      status: "error",
      error: message,
      isPolling: false,
    })),
  setPolling: (value) => set((state) => ({ ...state, isPolling: value })),
}));

export function useLiveSessionController(sessionKey: number | null) {
  useEffect(() => {
    if (sessionKey === null) {
      useLiveSessionStore.getState().reset(null);
      return;
    }

    let cancelled = false;
    let eventSource: EventSource | null = null;
    let fallbackIntervalId: number | null = null;
    useLiveSessionStore.getState().reset(sessionKey);

    const bootstrap = async () => {
      try {
        const [summary, boot, liveWindowResponse, raceControlResponse, driversResponse, latestTrackResponse, outlineResponse] =
          await Promise.all([
            fetchSessionSummary(sessionKey),
            fetchSessionBoot(sessionKey),
            fetchLiveWindow(sessionKey, 0, 40),
            fetchRaceControl(sessionKey, 12),
            fetchSessionDrivers(sessionKey),
            fetchTrackLatestPositions(sessionKey),
            fetchTrackOutline(sessionKey),
          ]);

        if (cancelled) {
          return;
        }

        useLiveSessionStore.getState().setBootstrap({
          summary,
          boot,
          liveWindow: liveWindowResponse.data,
          raceControl: raceControlResponse.data,
          sessionDrivers: driversResponse.data,
          latestTrackPositions: latestTrackResponse.data,
          outlinePoints: outlineResponse.data,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        useLiveSessionStore
          .getState()
          .setError(error instanceof Error ? error.message : "Live session unavailable");
      }
    };

    void bootstrap();

    const runPoll = async () => {
      const store = useLiveSessionStore.getState();

      if (store.sessionKey !== sessionKey || store.isPolling) {
        return;
      }

      store.setPolling(true);

      try {
        const [summary, boot, liveWindowResponse, raceControlResponse, latestTrackResponse] =
          await Promise.all([
            fetchSessionSummary(sessionKey),
            fetchSessionBoot(sessionKey),
            fetchLiveWindow(sessionKey, store.lastSequence + 1, 40),
            fetchRaceControl(sessionKey, 12),
            fetchTrackLatestPositions(sessionKey),
          ]);

        if (cancelled) {
          return;
        }

        useLiveSessionStore.getState().applyPollUpdate({
          summary,
          boot,
          liveWindow: liveWindowResponse.data,
          raceControl: raceControlResponse.data,
          latestTrackPositions: latestTrackResponse.data,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        useLiveSessionStore
          .getState()
          .setError(error instanceof Error ? error.message : "Live polling failed");
      }
    };

    const startFallbackPolling = () => {
      if (fallbackIntervalId !== null) {
        return;
      }

      useLiveSessionStore.setState((state) => ({
        ...state,
        transport: "fallback-poll",
      }));

      fallbackIntervalId = window.setInterval(() => {
        void runPoll();
      }, 10_000);
    };

    eventSource = new EventSource(`/api/sessions/${sessionKey}/stream`);
    eventSource.addEventListener("snapshot", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as {
        summary: SessionSummary;
        boot: SessionBoot;
        liveWindow: LiveEnvelope[];
        raceControl: RaceControlMessage[];
        latestTrackPositions: TrackPositionFrame[];
      };

      if (cancelled) {
        return;
      }

      useLiveSessionStore.setState((state) => ({ ...state, transport: "sse" }));
      useLiveSessionStore.getState().applyPollUpdate(payload);
    });
    eventSource.addEventListener("error", () => {
      if (cancelled) {
        return;
      }

      eventSource?.close();
      startFallbackPolling();
    });

    return () => {
      cancelled = true;
      eventSource?.close();
      if (fallbackIntervalId !== null) {
        window.clearInterval(fallbackIntervalId);
      }
    };
  }, [sessionKey]);
}
