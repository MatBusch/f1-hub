"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronRight,
  Flag,
  Radio,
  TimerReset,
  Zap,
} from "lucide-react";

import { fetchSessionCatalog } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusTone(status: string) {
  if (status === "live") {
    return "bg-[var(--destructive)] text-white";
  }

  if (status === "completed") {
    return "bg-[var(--muted)] text-[var(--foreground)]";
  }

  return "bg-[var(--accent)] text-[var(--accent-foreground)]";
}

function replayTone(replayReady: boolean) {
  if (replayReady) {
    return "bg-emerald-500/14 text-emerald-200 ring-1 ring-emerald-500/30";
  }

  return "bg-amber-500/14 text-amber-100 ring-1 ring-amber-500/30";
}

export function SessionCatalog() {
  const [statusFilter, setStatusFilter] = useState<
    "all" | "live" | "completed" | "scheduled"
  >("all");

  const catalogQuery = useQuery({
    queryKey: ["sessions", "catalog"],
    queryFn: () => fetchSessionCatalog(120),
    staleTime: 5 * 60_000,
  });

  const allRows = catalogQuery.data?.data ?? [];
  const rows = useMemo(
    () =>
      (statusFilter === "all"
        ? allRows
        : allRows.filter((row) => row.status === statusFilter)
      ).slice(0, 24),
    [allRows, statusFilter],
  );
  const completedRows = useMemo(
    () => allRows.filter((row) => row.status === "completed").slice(0, 6),
    [allRows],
  );
  const featuredCompleted = completedRows[0];
  const counts = useMemo(
    () => ({
      all: allRows.length,
      live: allRows.filter((row) => row.status === "live").length,
      completed: allRows.filter((row) => row.status === "completed").length,
      scheduled: allRows.filter((row) => row.status === "scheduled").length,
    }),
    [allRows],
  );

  const segments = [
    { id: "all", label: "All", count: counts.all },
    { id: "live", label: "Live", count: counts.live },
    { id: "completed", label: "Completed", count: counts.completed },
    { id: "scheduled", label: "Scheduled", count: counts.scheduled },
  ] as const;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--accent-soft),transparent_28%),linear-gradient(180deg,var(--background),var(--background-elevated))]">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 md:px-10 md:py-14">
        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <div className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-xs uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
              F1 Hub Catalog
            </div>
            <div className="space-y-3">
              <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.04em] md:text-7xl">
                Session catalog on top of Tinybird-backed APIs.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-[var(--muted-foreground)] md:text-lg">
                Historical and live entry points now come from the same backend
                contract. Seeded schedule data lands in Tinybird first, then the
                UI reads through Next route handlers only.
              </p>
            </div>
          </div>

          <Card className="border-[color-mix(in_oklab,var(--border),var(--primary)_18%)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--panel),white_3%),var(--panel-elevated))]">
            <CardHeader>
              <CardTitle>Latest completed session</CardTitle>
              <CardDescription>
                Use a finished session to validate the full Tinybird-backed read
                path.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-[var(--muted-foreground)]">
              {catalogQuery.isLoading ? (
                <div className="h-28 animate-pulse rounded-(--radius-md) bg-[var(--muted)]" />
              ) : catalogQuery.isError || !featuredCompleted ? (
                <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
                  No completed session is available yet.
                </div>
              ) : (
                <>
                  <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                      Meeting
                    </div>
                    <div className="mt-1 text-base font-medium text-[var(--foreground)]">
                      {featuredCompleted.meetingName}
                    </div>
                    <div className="mt-1 text-xs">
                      {featuredCompleted.sessionName}
                    </div>
                  </div>
                  <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
                    Started {formatDate(featuredCompleted.startsAt)}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span
                      className={`rounded-full px-2.5 py-1 font-semibold uppercase tracking-[0.16em] ${replayTone(
                        featuredCompleted.replayReady,
                      )}`}
                    >
                      {featuredCompleted.replayReady
                        ? "Replay ready"
                        : "Track pending"}
                    </span>
                    <span className="rounded-full border border-[var(--border)] px-2.5 py-1">
                      {featuredCompleted.driverCount} drivers
                    </span>
                    <span className="rounded-full border border-[var(--border)] px-2.5 py-1">
                      {featuredCompleted.frameCount.toLocaleString()} frames
                    </span>
                  </div>
                  <Button asChild>
                    <Link href={`/sessions/${featuredCompleted.sessionKey}`}>
                      Open completed session
                      <ChevronRight className="size-4" />
                    </Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="overflow-hidden bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary),white_18%),color-mix(in_oklab,var(--primary),black_14%))] text-[var(--primary-foreground)]">
            <CardHeader>
              <CardTitle className="text-3xl tracking-[-0.04em]">
                Explore stored race weekends like a product dashboard.
              </CardTitle>
              <CardDescription className="max-w-xl text-[color-mix(in_oklab,var(--primary-foreground),transparent_28%)]">
                Every card below is served from the same Tinybird-backed route
                layer. No browser fan-out, no session rebuild per viewer.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div className="rounded-(--radius-md) border border-white/20 bg-white/8 p-4">
                <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/70">
                  <TimerReset className="size-3.5" />
                  Stored sessions
                </div>
                <div className="mt-2 text-3xl font-semibold">{counts.all}</div>
              </div>
              <div className="rounded-(--radius-md) border border-white/20 bg-white/8 p-4">
                <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/70">
                  <Zap className="size-3.5" />
                  Completed
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {counts.completed}
                </div>
              </div>
              <div className="rounded-(--radius-md) border border-white/20 bg-white/8 p-4">
                <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/70">
                  <Radio className="size-3.5" />
                  Live now
                </div>
                <div className="mt-2 text-3xl font-semibold">{counts.live}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[var(--panel)]/95">
            <CardHeader>
              <CardTitle>Session Views</CardTitle>
              <CardDescription>
                Segment the catalog by lifecycle state without changing the read
                path.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {segments.map((segment) => (
                <button
                  key={segment.id}
                  type="button"
                  onClick={() => setStatusFilter(segment.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors ${
                    statusFilter === segment.id
                      ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                      : "border-[var(--border)] bg-[var(--panel-elevated)] text-[var(--foreground)] hover:bg-[var(--muted)]"
                  }`}
                >
                  <span>{segment.label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      statusFilter === segment.id
                        ? "bg-white/15 text-white"
                        : "bg-[var(--muted)] text-[var(--muted-foreground)]"
                    }`}
                  >
                    {segment.count}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        </section>

        {completedRows.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.03em]">
                  Recent Completed Sessions
                </h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Stored in Tinybird and ready for repeat reads without upstream
                  fetches.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {completedRows.map((session) => (
                <Card
                  key={`completed-${session.sessionKey}`}
                  className="group bg-[linear-gradient(180deg,color-mix(in_oklab,var(--panel),white_4%),var(--panel))]"
                >
                  <CardHeader className="gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle>{session.meetingName}</CardTitle>
                        <CardDescription>{session.sessionName}</CardDescription>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground)]">
                          completed
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${replayTone(
                            session.replayReady,
                          )}`}
                        >
                          {session.replayReady
                            ? "Replay ready"
                            : "Track pending"}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]">
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1">
                        <Flag className="size-3.5" />
                        {session.sessionType}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1">
                        <CalendarDays className="size-3.5" />
                        {formatDate(session.startsAt)}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1">
                        {session.frameCount.toLocaleString()} frames
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-3">
                    <div className="text-sm text-[var(--muted-foreground)]">
                      Session key{" "}
                      <span className="font-medium text-[var(--foreground)]">
                        {session.sessionKey}
                      </span>
                    </div>
                    <Button asChild variant="outline">
                      <Link href={`/sessions/${session.sessionKey}`}>
                        Inspect
                        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        {catalogQuery.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Card
                key={index}
                className="min-h-48 animate-pulse bg-[var(--panel)]"
              />
            ))}
          </div>
        ) : catalogQuery.isError ? (
          <Card className="border-[var(--destructive)]/30">
            <CardHeader>
              <CardTitle>Catalog unavailable</CardTitle>
              <CardDescription>
                {catalogQuery.error instanceof Error
                  ? catalogQuery.error.message
                  : "Unexpected catalog error"}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No sessions in this view</CardTitle>
              <CardDescription>
                There are no `{statusFilter}` sessions in the current catalog
                slice.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.03em]">
                  {statusFilter === "all"
                    ? "All Sessions"
                    : `${statusFilter[0]!.toUpperCase()}${statusFilter.slice(1)} Sessions`}
                </h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Serving {rows.length} rows from Tinybird for the current
                  filter.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((session) => (
                <Card
                  key={session.sessionKey}
                  className="group overflow-hidden bg-[linear-gradient(180deg,color-mix(in_oklab,var(--panel),white_4%),var(--panel))]"
                >
                  <CardHeader className="gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle>{session.meetingName}</CardTitle>
                        <CardDescription>{session.sessionName}</CardDescription>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${statusTone(session.status)}`}
                        >
                          {session.status}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${replayTone(
                            session.replayReady,
                          )}`}
                        >
                          {session.replayReady
                            ? "Replay ready"
                            : "Track pending"}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]">
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1">
                        <Flag className="size-3.5" />
                        {session.sessionType}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1">
                        <CalendarDays className="size-3.5" />
                        {formatDate(session.startsAt)}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1">
                        {session.driverCount} drivers
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1">
                        {session.frameCount.toLocaleString()} frames
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex items-end justify-between gap-3">
                    <div className="text-sm text-[var(--muted-foreground)]">
                      Session key{" "}
                      <span className="font-medium text-[var(--foreground)]">
                        {session.sessionKey}
                      </span>
                    </div>
                    <Button asChild variant="outline">
                      <Link href={`/sessions/${session.sessionKey}`}>
                        Open session
                        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="bg-[var(--panel)]/95">
            <CardHeader>
              <CardTitle>Read path</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-[var(--muted-foreground)]">
              <p>Browser calls Next route handlers.</p>
              <p>Route handlers call the Tinybird repository.</p>
              <p>
                Tinybird serves both historical and live-oriented session
                surfaces.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-[var(--panel)]/95">
            <CardHeader>
              <CardTitle>Live path</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-[var(--muted-foreground)]">
              <p>
                Collector writes raw and normalized events into Tinybird only.
              </p>
              <p>
                Live session UI will read `live_window` and `race_control_feed`
                through the same backend layer.
              </p>
              <p className="inline-flex items-center gap-2 text-[var(--foreground)]">
                <Radio className="size-4 text-[var(--destructive)]" />
                No browser-to-upstream fan-out.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
