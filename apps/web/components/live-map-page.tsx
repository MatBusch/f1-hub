"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Map, Radio } from "lucide-react";

import { fetchSessionCatalog } from "@/lib/api";
import {
  useLiveSessionController,
  useLiveSessionStore,
} from "@/lib/live-session-store";
import {
  getTrackSurfaceModel,
  getTrackSurfaceModelFromFrames,
} from "@/lib/session-insights";
import { TrackSurface } from "@/components/track-surface";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LiveMapPage() {
  const [selectedSessionKey, setSelectedSessionKey] = useState<number | null>(null);
  const liveSessionsQuery = useQuery({
    queryKey: ["sessions", "map-live-catalog"],
    queryFn: () => fetchSessionCatalog(12, "live"),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const liveSessions = liveSessionsQuery.data?.data ?? [];

  useEffect(() => {
    if (liveSessions.length === 0) {
      setSelectedSessionKey(null);
      return;
    }

    setSelectedSessionKey((current) => {
      if (current && liveSessions.some((session) => session.sessionKey === current)) {
        return current;
      }

      return liveSessions[0]!.sessionKey;
    });
  }, [liveSessions]);

  const activeSession = useMemo(
    () => liveSessions.find((session) => session.sessionKey === selectedSessionKey),
    [liveSessions, selectedSessionKey],
  );

  useLiveSessionController(activeSession?.sessionKey ?? null);

  const boot = useLiveSessionStore((state) => state.boot);
  const sessionDrivers = useLiveSessionStore((state) => state.sessionDrivers);
  const latestTrackPositions = useLiveSessionStore(
    (state) => state.latestTrackPositions,
  );
  const outlinePoints = useLiveSessionStore((state) => state.outlinePoints);
  const liveWindow = useLiveSessionStore((state) => state.liveWindow);

  const trackSurfaceModel = useMemo(
    () =>
      getTrackSurfaceModelFromFrames({
        boot: boot ?? undefined,
        displayPositions: latestTrackPositions,
        sessionDrivers,
        outlinePoints,
      }) ?? getTrackSurfaceModel(boot ?? undefined, latestTrackPositions.length > 0),
    [boot, latestTrackPositions, outlinePoints, sessionDrivers],
  );

  if (liveSessionsQuery.isLoading) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--accent-soft),transparent_28%),linear-gradient(180deg,var(--background),var(--background-elevated))]">
        <div className="mx-auto max-w-7xl px-6 py-10 md:px-10 md:py-14">
          <Card className="min-h-[36rem] animate-pulse bg-[var(--panel)]" />
        </div>
      </main>
    );
  }

  if (liveSessions.length === 0) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--accent-soft),transparent_28%),linear-gradient(180deg,var(--background),var(--background-elevated))]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10 md:px-10 md:py-14">
          <Card>
            <CardHeader>
              <CardTitle>No live map available</CardTitle>
              <CardDescription>
                The dedicated map route wakes up during active sessions only.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-3">
              <Button asChild>
                <Link href="/dashboard">
                  Open dashboard
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/simulate">Open simulate hub</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--accent-soft),transparent_28%),linear-gradient(180deg,var(--background),var(--background-elevated))]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10 md:px-10 md:py-14">
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden border-[color-mix(in_oklab,var(--border),var(--primary)_18%)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--panel),white_4%),var(--panel-elevated))]">
            <CardHeader>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                <Map className="size-3.5" />
                Live map
              </div>
              <CardTitle className="text-4xl tracking-[-0.04em] md:text-6xl">
                Dedicated track view for active sessions.
              </CardTitle>
              <CardDescription className="max-w-2xl text-base leading-7 text-[var(--muted-foreground)]">
                This route strips the race-day experience down to track position context,
                session switching, and just enough live signal density to stay useful.
              </CardDescription>
              <div className="flex flex-wrap gap-2">
                {liveSessions.map((session) => (
                  <button
                    key={session.sessionKey}
                    type="button"
                    onClick={() => setSelectedSessionKey(session.sessionKey)}
                    className={`rounded-full border px-3 py-2 text-sm transition-colors ${
                      session.sessionKey === activeSession?.sessionKey
                        ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                        : "border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)] hover:bg-[var(--muted)]"
                    }`}
                  >
                    {session.sessionName}
                  </button>
                ))}
              </div>
            </CardHeader>
          </Card>

          <Card className="bg-[var(--panel)]/95">
            <CardHeader>
              <CardTitle>Track context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[var(--muted-foreground)]">
              <div>{activeSession?.meetingName ?? "Live session"}</div>
              <div>{latestTrackPositions.length} live positions loaded</div>
              <div>{sessionDrivers.length} tracked drivers</div>
              <div>{liveWindow.length} recent live envelopes retained</div>
              <div className="flex gap-3 pt-2">
                <Button asChild>
                  <Link href="/dashboard">
                    Dashboard
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/simulate">
                    <Radio className="size-4" />
                    Simulate
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <TrackSurface model={trackSurfaceModel} />
      </div>
    </main>
  );
}
