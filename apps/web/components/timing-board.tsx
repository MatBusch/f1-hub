"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, TimerReset } from "lucide-react";

import { fetchSessionCatalog } from "@/lib/api";
import {
  useLiveSessionController,
  useLiveSessionStore,
} from "@/lib/live-session-store";
import {
  getBootTopicCoverage,
  getLeaderboard,
  getSessionState,
  getWeather,
} from "@/lib/session-insights";
import {
  MetricPanel,
  PanelShell,
  RaceControlPanel,
  SessionSwitcherPanel,
  SignalFeedPanel,
  TimingTowerPanel,
} from "@/components/live-dashboard-panels";
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

export function TimingBoard() {
  const [selectedSessionKey, setSelectedSessionKey] = useState<number | null>(null);

  const liveSessionsQuery = useQuery({
    queryKey: ["sessions", "timing-live-catalog"],
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
  const activeSessionKey = activeSession?.sessionKey;

  useLiveSessionController(activeSessionKey ?? null);

  const liveStatus = useLiveSessionStore((state) => state.status);
  const summary = useLiveSessionStore((state) => state.summary);
  const boot = useLiveSessionStore((state) => state.boot);
  const liveWindow = useLiveSessionStore((state) => state.liveWindow);
  const raceControl = useLiveSessionStore((state) => state.raceControl);

  const leaderboard = useMemo(() => getLeaderboard(boot ?? undefined), [boot]);
  const sessionState = useMemo(() => getSessionState(boot ?? undefined), [boot]);
  const weather = useMemo(() => getWeather(boot ?? undefined), [boot]);
  const topicCoverage = useMemo(
    () => getBootTopicCoverage(boot ?? undefined),
    [boot],
  );
  const recentSignals = useMemo(
    () => [...liveWindow].sort((left, right) => right.sequence - left.sequence).slice(0, 10),
    [liveWindow],
  );
  const availableTopicCount = topicCoverage.filter((topic) => topic.available).length;

  if (liveSessionsQuery.isLoading || (activeSessionKey !== undefined && liveStatus === "loading")) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--accent-soft),transparent_28%),linear-gradient(180deg,var(--background),var(--background-elevated))]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 md:px-8 md:py-10">
          <Card className="min-h-[14rem] animate-pulse bg-[var(--panel)]" />
          <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
            <Card className="min-h-[32rem] animate-pulse bg-[var(--panel)]" />
            <Card className="min-h-[32rem] animate-pulse bg-[var(--panel)]" />
          </div>
        </div>
      </main>
    );
  }

  if (liveSessions.length === 0) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--accent-soft),transparent_28%),linear-gradient(180deg,var(--background),var(--background-elevated))]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 md:px-8 md:py-10">
          <Card>
            <CardHeader>
              <CardTitle>No live timing board available</CardTitle>
              <CardDescription>
                This route wakes up during active sessions only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/dashboard">
                  Open dashboard
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
        <section className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
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

            <PanelShell
              title="Timing Context"
              description="Dense race-state summary for the selected live session."
            >
              <div className="grid gap-3">
                <MetricPanel
                  label="Clock"
                  value={sessionState?.clock ?? "--:--:--"}
                  hint="Official remaining time"
                />
                <MetricPanel
                  label="Track"
                  value={sessionState?.trackMessage ?? sessionState?.trackStatus ?? "Unknown"}
                  hint="Current control condition"
                />
                <MetricPanel
                  label="Drivers / topics"
                  value={`${summary?.driverCount ?? activeSession?.driverCount ?? 0} / ${availableTopicCount}`}
                  hint="Field and live topic coverage"
                />
              </div>
            </PanelShell>

            <PanelShell title="Atmosphere" description="Quick weather and signal context.">
              <div className="space-y-2 text-sm text-[var(--muted-foreground)]">
                <div>Air {weather?.airTemp ?? "--"}C</div>
                <div>Track {weather?.trackTemp ?? "--"}C</div>
                <div>Humidity {weather?.humidity ?? "--"}%</div>
                <div>Wind {weather?.windSpeed ?? "--"} km/h</div>
                <div>Rain {weather?.rainfall ?? "--"}</div>
              </div>
            </PanelShell>
          </div>

          <div className="space-y-6">
            <Card className="overflow-hidden border-[color-mix(in_oklab,var(--border),var(--primary)_20%)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--panel),white_3%),var(--panel-elevated))]">
              <CardHeader>
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                  <TimerReset className="size-3.5" />
                  Live timing board
                </div>
                <CardTitle className="text-4xl tracking-[-0.04em] md:text-6xl">
                  {activeSession?.meetingName ?? "Timing Board"}
                </CardTitle>
                <CardDescription className="max-w-2xl text-base leading-7 text-[var(--muted-foreground)]">
                  {activeSession?.sessionName ?? "Current session"} in a denser,
                  board-first layout for race monitoring.
                </CardDescription>
              </CardHeader>
            </Card>

            <TimingTowerPanel rows={leaderboard} />

            <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
              <RaceControlPanel messages={raceControl} />
              <SignalFeedPanel envelopes={recentSignals} />
            </section>

            <PanelShell
              title="Latest Activity"
              description="Freshest race control and signal timestamps."
            >
              <div className="grid gap-3 text-sm text-[var(--muted-foreground)] md:grid-cols-2">
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                  Last race control: {raceControl[0] ? formatDate(raceControl[0].emittedAt) : "-"}
                </div>
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
                  Last signal: {recentSignals[0] ? formatDate(recentSignals[0].emittedAt) : "-"}
                </div>
              </div>
            </PanelShell>
          </div>
        </section>
      </div>
    </main>
  );
}
