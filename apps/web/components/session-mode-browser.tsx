"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Radio, TimerReset } from "lucide-react";

import { fetchSessionCatalog } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

export function SessionModeBrowser({
  mode,
  title,
  description,
}: {
  mode: "simulate" | "telemetry";
  title: string;
  description: string;
}) {
  const catalogQuery = useQuery({
    queryKey: ["sessions", "catalog", mode],
    queryFn: () => fetchSessionCatalog(60, "completed"),
    staleTime: 60_000,
  });

  const liveCatalogQuery = useQuery({
    queryKey: ["sessions", "catalog", mode, "live"],
    queryFn: () => fetchSessionCatalog(6, "live"),
    staleTime: 30_000,
  });

  const rows = catalogQuery.data?.data ?? [];
  const completedRows = useMemo(
    () =>
      rows
        .filter((session) => session.status === "completed")
        .sort((left, right) => {
          if (mode === "simulate") {
            if (left.replayReady !== right.replayReady) {
              return left.replayReady ? -1 : 1;
            }

            if (left.hasFrames !== right.hasFrames) {
              return left.hasFrames ? -1 : 1;
            }
          }

          return new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime();
        })
        .slice(0, 9),
    [mode, rows],
  );
  const liveRows = useMemo(
    () => (liveCatalogQuery.data?.data ?? []).slice(0, 3),
    [liveCatalogQuery.data?.data],
  );

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10 md:px-10 md:py-14">
        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <div className="inline-flex w-fit items-center gap-2 border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                {mode === "simulate" ? <TimerReset className="size-3.5" /> : <Radio className="size-3.5" />}
                {mode === "simulate" ? "replay hub" : `${mode} hub`}
              </div>
              <CardTitle className="text-2xl">{title}</CardTitle>
              <CardDescription className="max-w-2xl text-[12px] leading-relaxed text-[var(--muted-foreground)]">
                {description}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>How this route works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-[12px] text-[var(--muted-foreground)]">
              <p>
                The top-level route matches the F1Dash-style information architecture, while session-specific
                workspaces still live under each session for direct linking.
              </p>
              <div className="border border-[var(--border)] bg-[var(--muted)] p-3 text-[11px]">
                {mode === "simulate"
                  ? "Open a completed session to enter the replay view with transport controls and track playback."
                  : "Open a completed session to enter the telemetry lab for historical driver analysis."}
              </div>
            </CardContent>
          </Card>
        </section>

        {liveRows.length > 0 ? (
          <section className="grid gap-4 md:grid-cols-3">
            {liveRows.map((session) => (
              <Card key={`live-${session.sessionKey}`}>
                <CardHeader>
                  <CardTitle>{session.meetingName}</CardTitle>
                  <CardDescription>{session.sessionName}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-[12px] text-[var(--muted-foreground)]">
                  <div>Live now</div>
                  <Button asChild variant="outline">
                    <Link href="/dashboard">Open live dashboard</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </section>
        ) : null}

        <section className="space-y-4">
          <div>
            <h2 className="text-[13px] font-bold">Completed Sessions</h2>
            <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
              Pick a stored session and jump directly into the dedicated {mode === "simulate" ? "replay" : mode} workspace.
            </p>
            {mode === "simulate" ? (
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Replay-ready sessions with stored frames are pinned first.
              </p>
            ) : null}
          </div>
          {catalogQuery.isLoading ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Card key={index}>
                  <CardHeader className="space-y-3">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-10 w-32" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}
          {!catalogQuery.isLoading && completedRows.length === 0 ? (
            <div className="border border-[var(--border)] bg-[var(--panel)] p-6 text-[12px] text-[var(--muted-foreground)]">
              No completed sessions were found for this workspace yet.
            </div>
          ) : null}
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {completedRows.map((session) => (
              <Card key={`${mode}-${session.sessionKey}`}>
                <CardHeader>
                  <CardTitle>{session.meetingName}</CardTitle>
                  <CardDescription>{session.sessionName}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-[12px] text-[var(--muted-foreground)]">
                  <div>{formatDate(session.startsAt)}</div>
                  <div>{session.frameCount.toLocaleString()} frames</div>
                  {mode === "simulate" ? (
                    <div>
                      {session.replayReady ? "Replay ready" : "Replay not ready"}
                    </div>
                  ) : null}
                  <Button asChild>
                    <Link href={`/sessions/${session.sessionKey}/${mode}`}>
                      Open {mode === "simulate" ? "replay" : mode}
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
