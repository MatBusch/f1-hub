"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchSessionCatalog } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function CloneSessionBrowser() {
  const query = useQuery({
    queryKey: ["sessions", "clone-browser"],
    queryFn: () => fetchSessionCatalog(60, "completed"),
    staleTime: 60_000,
  });

  const rows = useMemo(
    () => (query.data?.data ?? []).filter((row) => row.replayReady && row.hasFrames).slice(0, 12),
    [query.data?.data],
  );

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-7xl px-6 py-10 md:px-8">
        <div className="mb-8 space-y-3">
          <div className="text-[11px] uppercase tracking-[0.22em] text-white/50">Clone</div>
          <h1 className="text-5xl font-semibold tracking-[-0.04em]">Fastlytics-style replay route.</h1>
          <p className="max-w-3xl text-base text-white/60">
            This route mirrors the open-source replay structure: large track canvas, right leaderboard, and bottom transport bar.
          </p>
        </div>

        {query.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="border-white/10 bg-white/5 text-white">
                <CardHeader className="space-y-3">
                  <Skeleton className="h-6 w-2/3 bg-white/10" />
                  <Skeleton className="h-4 w-1/2 bg-white/10" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-4 w-1/2 bg-white/10" />
                  <Skeleton className="h-10 w-32 bg-white/10" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((session) => (
              <Card key={session.sessionKey} className="border-white/10 bg-white/5 text-white">
                <CardHeader>
                  <CardTitle>{session.meetingName}</CardTitle>
                  <CardDescription className="text-white/55">{session.sessionName}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-white/60">
                  <div>{formatDate(session.startsAt)}</div>
                  <div>{session.frameCount.toLocaleString()} frames</div>
                  <Button asChild className="bg-red-600 text-white hover:bg-red-500">
                    <Link href={`/clone/${session.sessionKey}`}>Open clone replay</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
