"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Radio, TimerReset, Waves } from "lucide-react";

import { fetchSessionCatalog } from "@/lib/api";
import { SessionCatalog } from "@/components/session-catalog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
      <section className="bg-[radial-gradient(circle_at_top_left,var(--accent-soft),transparent_28%),linear-gradient(180deg,var(--background),var(--background-elevated))]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10 md:px-10 md:py-14">
          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="overflow-hidden border-[color-mix(in_oklab,var(--border),var(--primary)_18%)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--panel),white_4%),var(--panel-elevated))]">
              <CardHeader className="gap-5">
                <div className="inline-flex w-fit items-center rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-xs uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
                  F1 Hub Workspace
                </div>
                <div className="space-y-3">
                  <CardTitle className="max-w-4xl text-5xl font-semibold tracking-[-0.04em] md:text-7xl">
                    Live race control room, replay, and deep-dive analysis in one system.
                  </CardTitle>
                  <CardDescription className="max-w-2xl text-base leading-7 text-[var(--muted-foreground)] md:text-lg">
                    The app now has a dedicated direction: a focused live page for
                    active sessions, with historical simulation and telemetry workspaces
                    growing separately from the race-day surface.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link href="/dashboard">
                      Open live control room
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  {latestCompleted ? (
                    <Button asChild variant="outline">
                      <Link href={`/sessions/${latestCompleted.sessionKey}`}>
                        Open latest session
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
            </Card>

            <div className="grid gap-4">
              <Card className="bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary),white_16%),color-mix(in_oklab,var(--primary),black_14%))] text-[var(--primary-foreground)]">
                <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Radio className="size-5" />
                  Live page
                  </CardTitle>
                  <CardDescription className="text-[color-mix(in_oklab,var(--primary-foreground),transparent_28%)]">
                    Race-day timing tower, track surface, race control, and rolling signal windows.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-[color-mix(in_oklab,var(--primary-foreground),transparent_18%)]">
                  {liveSession
                    ? `${liveSession.meetingName} is currently live and ready for the dedicated control room.`
                    : "No live session right now, but the dedicated control room is in place for the next race."}
                </CardContent>
              </Card>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <Card className="bg-[var(--panel)]/95">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TimerReset className="size-4" />
                      Simulation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-[var(--muted-foreground)]">
                    <p>
                      Historical sessions stay chunkable and replay-safe instead of overloading live mode.
                    </p>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/simulate">Open simulate hub</Link>
                    </Button>
                  </CardContent>
                </Card>
                <Card className="bg-[var(--panel)]/95">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Waves className="size-4" />
                      Deep dives
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-[var(--muted-foreground)]">
                    <p>
                      Telemetry overlays, stint views, and comparisons can grow into their own pages next.
                    </p>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/telemetry">Open telemetry hub</Link>
                    </Button>
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
