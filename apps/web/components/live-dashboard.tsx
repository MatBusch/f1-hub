"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Radio } from "lucide-react";

import { fetchSessionCatalog } from "@/lib/api";
import {
  useLiveSessionController,
  useLiveSessionStore,
} from "@/lib/live-session-store";
import {
  getBootTopicCoverage,
  getLeaderboard,
  getSessionState,
  getTrackSurfaceModel,
  getTrackSurfaceModelFromFrames,
  getWeather,
} from "@/lib/session-insights";
import {
  MetricPanel,
  RaceControlPanel,
  SessionSwitcherPanel,
  SignalFeedPanel,
  TimingTowerPanel,
  WeatherPanel,
  WorkspaceLinksPanel,
} from "@/components/live-dashboard-panels";
import { TrackSurface } from "@/components/track-surface";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function LiveDashboard() {
  const [selectedSessionKey, setSelectedSessionKey] = useState<number | null>(null);

  const liveSessionsQuery = useQuery({
    queryKey: ["sessions", "live-catalog"],
    queryFn: () => fetchSessionCatalog(12, "live"),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
  const recentSessionsQuery = useQuery({
    queryKey: ["sessions", "catalog", "fallback"],
    queryFn: () => fetchSessionCatalog(8),
    staleTime: 60_000,
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
  const activeSessionKey = activeSession?.sessionKey;

  useLiveSessionController(activeSessionKey ?? null);

  const liveStatus = useLiveSessionStore((state) => state.status);
  const liveError = useLiveSessionStore((state) => state.error);
  const summary = useLiveSessionStore((state) => state.summary);
  const boot = useLiveSessionStore((state) => state.boot);
  const liveWindow = useLiveSessionStore((state) => state.liveWindow);
  const raceControl = useLiveSessionStore((state) => state.raceControl);
  const sessionDrivers = useLiveSessionStore((state) => state.sessionDrivers);
  const latestTrackPositions = useLiveSessionStore(
    (state) => state.latestTrackPositions,
  );
  const outlinePoints = useLiveSessionStore((state) => state.outlinePoints);

  const weather = useMemo(() => getWeather(boot ?? undefined), [boot]);
  const sessionState = useMemo(() => getSessionState(boot ?? undefined), [boot]);
  const leaderboard = useMemo(() => getLeaderboard(boot ?? undefined), [boot]);
  const topicCoverage = useMemo(
    () => getBootTopicCoverage(boot ?? undefined),
    [boot],
  );
  const availableTopicCount = topicCoverage.filter((topic) => topic.available).length;
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
  const recentSignals = useMemo(
    () => [...liveWindow].sort((left, right) => right.sequence - left.sequence).slice(0, 6),
    [liveWindow],
  );
  const recentCompleted = useMemo(
    () =>
      (recentSessionsQuery.data?.data ?? [])
        .filter((session) => session.status === "completed")
        .slice(0, 3),
    [recentSessionsQuery.data?.data],
  );

  if (liveSessionsQuery.isLoading || (activeSessionKey !== undefined && liveStatus === "loading")) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--accent-soft),transparent_28%),linear-gradient(180deg,var(--background),var(--background-elevated))]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 md:px-8 md:py-10">
          <Card className="min-h-72 animate-pulse bg-[var(--panel)]" />
          <div className="grid gap-4 2xl:grid-cols-[0.74fr_1.28fr_0.82fr]">
            <Card className="min-h-[24rem] animate-pulse bg-[var(--panel)]" />
            <Card className="min-h-[24rem] animate-pulse bg-[var(--panel)]" />
            <Card className="min-h-[24rem] animate-pulse bg-[var(--panel)]" />
          </div>
        </div>
      </main>
    );
  }

  if (liveSessions.length === 0) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--accent-soft),transparent_28%),linear-gradient(180deg,var(--background),var(--background-elevated))]">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8 md:px-8 md:py-10">
          <Card className="overflow-hidden border-[color-mix(in_oklab,var(--border),var(--primary)_20%)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--panel),white_3%),var(--panel-elevated))]">
            <CardHeader className="gap-4">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                <Radio className="size-3.5" />
                Live Control Room
              </div>
              <CardTitle className="max-w-4xl text-4xl tracking-[-0.04em] md:text-6xl">
                No race is live right now, but the dedicated live shell is ready.
              </CardTitle>
              <CardDescription className="max-w-2xl text-base leading-7 text-[var(--muted-foreground)]">
                This page is reserved for active sessions only. Historical replay,
                simulation, and telemetry deep dives stay separate so the live
                experience can stay fast and focused.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/simulate">
                  Browse historical sessions
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {recentCompleted.length > 0 ? (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {recentCompleted.map((session) => (
                <Card
                  key={session.sessionKey}
                  className="bg-[linear-gradient(180deg,color-mix(in_oklab,var(--panel),white_4%),var(--panel))]"
                >
                  <CardHeader>
                    <CardTitle>{session.meetingName}</CardTitle>
                    <CardDescription>{session.sessionName}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-[var(--muted-foreground)]">
                    <div>{formatDate(session.startsAt)}</div>
                    <div>{session.frameCount.toLocaleString()} stored frames</div>
                    <Button asChild variant="outline">
                      <Link href={`/sessions/${session.sessionKey}`}>Open session</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </section>
          ) : null}
        </div>
      </main>
    );
  }

  if (liveStatus === "error") {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--accent-soft),transparent_28%),linear-gradient(180deg,var(--background),var(--background-elevated))]">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8 md:px-8 md:py-10">
          <Card className="border-[var(--destructive)]/30">
            <CardHeader>
              <CardTitle>Live dashboard unavailable</CardTitle>
              <CardDescription>{liveError ?? "Live session failed to load."}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/simulate">
                  Open simulation hub
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--accent-soft),transparent_28%),linear-gradient(180deg,var(--background),var(--background-elevated))]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 md:px-8 md:py-10">
        <section className="grid gap-6 2xl:grid-cols-[0.74fr_1.28fr_0.82fr]">
          <div className="space-y-6">
            <SessionSwitcherPanel
              sessions={liveSessions.map((session) => ({
                sessionKey: session.sessionKey,
                sessionName: session.sessionName,
                meetingName: session.meetingName,
              }))}
              activeSessionKey={activeSessionKey}
              onSelect={setSelectedSessionKey}
            />
            <WorkspaceLinksPanel sessionKey={activeSessionKey} />
          </div>

          <div className="space-y-6">
            <Card className="overflow-hidden border-[color-mix(in_oklab,var(--border),var(--primary)_20%)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--panel),white_3%),var(--panel-elevated))]">
              <CardHeader className="gap-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-[var(--destructive)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white">
                    <span className="size-2 rounded-full bg-white animate-pulse" />
                    Live
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                    Dedicated Control Room
                  </span>
                </div>
                <div className="space-y-3">
                  <CardTitle className="max-w-4xl text-4xl tracking-[-0.04em] md:text-6xl">
                    {activeSession?.meetingName ?? "Live Session"}
                  </CardTitle>
                  <CardDescription className="max-w-2xl text-base leading-7 text-[var(--muted-foreground)]">
                    {activeSession?.sessionName ?? "Current session"} running in a
                    live-first layout. Historical simulation, replay, and telemetry
                    deep dives stay separate so this surface can stay focused.
                  </CardDescription>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <MetricPanel
                    label="Session clock"
                    value={sessionState?.clock ?? "--:--:--"}
                    hint="Official session countdown"
                  />
                  <MetricPanel
                    label="Track status"
                    value={sessionState?.trackMessage ?? sessionState?.trackStatus ?? "Unknown"}
                    hint="Current race control condition"
                  />
                  <MetricPanel
                    label="Drivers / topics"
                    value={`${summary?.driverCount ?? activeSession?.driverCount ?? 0} / ${availableTopicCount}`}
                    hint="Field size and topic coverage"
                  />
                </div>
              </CardHeader>
            </Card>

            <TrackSurface model={trackSurfaceModel} />
            <WeatherPanel
              airTemp={weather?.airTemp}
              trackTemp={weather?.trackTemp}
              humidity={weather?.humidity}
              windSpeed={weather?.windSpeed}
              rainfall={weather?.rainfall}
            />
          </div>

          <div className="space-y-6">
            <TimingTowerPanel rows={leaderboard} />
            <RaceControlPanel messages={raceControl} />
            <SignalFeedPanel envelopes={recentSignals} />
          </div>
        </section>
      </div>
    </main>
  );
}
