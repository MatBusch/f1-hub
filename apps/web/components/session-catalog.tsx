"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Flag } from "lucide-react";

import NumberFlow from "@number-flow/react";

import { fetchSessionCatalog } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CtaLink } from "@/components/ui/cta-link";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function replayTone(replayReady: boolean) {
  if (replayReady) {
    return "bg-emerald-500/14 text-emerald-200 ring-1 ring-emerald-500/30";
  }

  return "bg-amber-500/14 text-amber-100 ring-1 ring-amber-500/30";
}

export function SessionCatalog() {
  const catalogQuery = useQuery({
    queryKey: ["sessions", "catalog"],
    queryFn: () => fetchSessionCatalog(120),
    staleTime: 5 * 60_000,
  });

  const allRows = catalogQuery.data?.data ?? [];
  const completedRows = useMemo(
    () => allRows.filter((row) => row.status === "completed").slice(0, 6),
    [allRows],
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--accent-soft),transparent_28%),linear-gradient(180deg,var(--background),var(--background-elevated))]">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 md:px-10 md:py-14">
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
                        <Badge>completed</Badge>
                        <Badge className={replayTone(session.replayReady)}>
                          {session.replayReady
                            ? "Replay ready"
                            : "Track pending"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]">
                      <Badge variant="outline">
                        <Flag className="size-3.5" />
                        {session.sessionType}
                      </Badge>
                      <Badge variant="outline">
                        <CalendarDays className="size-3.5" />
                        {formatDate(session.startsAt)}
                      </Badge>
                      <Badge variant="outline">
                        <NumberFlow value={session.frameCount} /> frames
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-3">
                    <div className="text-sm text-[var(--muted-foreground)]">
                      Session key{" "}
                      <span className="font-medium text-[var(--foreground)]">
                        {session.sessionKey}
                      </span>
                    </div>
                    <CtaLink href={`/sessions/${session.sessionKey}/simulate`}>
                      Open replay
                    </CtaLink>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ) : catalogQuery.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card
                key={index}
                className="min-h-48 animate-pulse bg-[var(--panel)]"
              />
            ))}
          </div>
        ) : catalogQuery.isError ? (
          <Card className="border-[var(--destructive)]/30">
            <CardHeader>
              <CardTitle>Recent sessions unavailable</CardTitle>
              <CardDescription>
                {catalogQuery.error instanceof Error
                  ? catalogQuery.error.message
                  : "Unexpected catalog error"}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No completed sessions yet</CardTitle>
              <CardDescription>
                Completed sessions will show up here once replay data is ready.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </main>
  );
}
