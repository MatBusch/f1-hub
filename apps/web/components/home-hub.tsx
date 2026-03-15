"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Radio, TimerReset, Waves } from "lucide-react";

import { fetchSessionCatalog } from "@/lib/api";
import { SessionCatalog } from "@/components/session-catalog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CtaLink } from "@/components/ui/cta-link";

export function HomeHub() {
  const catalogQuery = useQuery({
    queryKey: ["sessions", "catalog", "home-hub"],
    queryFn: () => fetchSessionCatalog(24),
    staleTime: 60_000,
  });

  const rows = catalogQuery.data?.data ?? [];
  const liveSession = useMemo(
    () => rows.find((session) => session.status === "live"),
    [rows],
  );
  const latestCompleted = useMemo(
    () => rows.find((session) => session.status === "completed"),
    [rows],
  );

  return (
    <>
      <section className="bg-[var(--background)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 md:px-6">
          <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="overflow-hidden border-[var(--border-strong)]">
              <CardHeader className="gap-4">
                <div className="inline-flex w-fit items-center border border-[var(--border)] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                  F1 Hub Workspace
                </div>
                <div className="space-y-2">
                  <CardTitle className="max-w-4xl text-lg font-semibold md:text-xl">
                    Live race control room, replay, and deep-dive analysis in
                    one system.
                  </CardTitle>
                  <CardDescription className="max-w-2xl text-[12px] leading-relaxed text-[var(--muted-foreground)]">
                    The app now has a dedicated direction: a focused live page
                    for active sessions, with historical simulation and
                    telemetry workspaces growing separately from the race-day
                    surface.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CtaLink href="/dashboard" variant="default">
                    Open live control room
                  </CtaLink>
                  {latestCompleted ? (
                    <CtaLink
                      href={`/sessions/${latestCompleted.sessionKey}/simulate`}
                    >
                      Open latest session
                    </CtaLink>
                  ) : null}
                </div>
              </CardHeader>
            </Card>

            <div className="grid gap-2">
              <Card className="border-[var(--primary)]/30 bg-[var(--primary)]/8">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-[13px] text-[var(--primary)]">
                    <Radio className="size-4" />
                    Live Page
                  </CardTitle>
                  <CardDescription className="text-[11px] text-[var(--muted-foreground)]">
                    Race-day timing tower, track surface, race control, and
                    rolling signal windows.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-[11px] text-[var(--muted-foreground)]">
                  {liveSession
                    ? `${liveSession.meetingName} is currently live and ready for the dedicated control room.`
                    : "No live session right now, but the dedicated control room is in place for the next race."}
                </CardContent>
              </Card>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-[12px]">
                      <TimerReset className="size-3.5" />
                      Simulation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-[11px] text-[var(--muted-foreground)]">
                    <p>
                      Historical sessions stay chunkable and replay-safe instead
                      of overloading live mode.
                    </p>
                    <CtaLink href="/simulate" size="sm">
                      Open simulate hub
                    </CtaLink>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-[12px]">
                      <Waves className="size-3.5" />
                      Deep Dives
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-[11px] text-[var(--muted-foreground)]">
                    <p>
                      Telemetry overlays, stint views, and comparisons can grow
                      into their own pages next.
                    </p>
                    <CtaLink href="/telemetry" size="sm">
                      Open telemetry hub
                    </CtaLink>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>
        </div>
      </section>

      <SessionCatalog />
    </>
  );
}
