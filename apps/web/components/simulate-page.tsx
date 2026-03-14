"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  ChevronDown,
  Clock,
  Filter,
  Flag,
  Gauge,
  Layers,
  Play,
  PlaySquare,
  Radio,
  Search,
  Timer,
} from "lucide-react";

import NumberFlow from "@number-flow/react";

import { fetchSessionCatalog } from "@/lib/api";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function sessionTypeColor(sessionType: string): string {
  const type = sessionType.toLowerCase();
  if (type.includes("race"))
    return "bg-red-500/15 text-red-400 border-red-500/30";
  if (type.includes("qualifying") || type.includes("quali"))
    return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  if (type.includes("sprint"))
    return "bg-purple-500/15 text-purple-400 border-purple-500/30";
  return "bg-blue-500/15 text-blue-400 border-blue-500/30";
}

type FilterType = "all" | "race" | "qualifying" | "practice" | "sprint";

export function SimulatePage() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const catalogQuery = useQuery({
    queryKey: ["sessions", "catalog", "simulate-page"],
    queryFn: () => fetchSessionCatalog(60, "completed"),
    staleTime: 60_000,
  });

  const liveCatalogQuery = useQuery({
    queryKey: ["sessions", "catalog", "simulate-page", "live"],
    queryFn: () => fetchSessionCatalog(6, "live"),
    staleTime: 30_000,
  });

  const rows = catalogQuery.data?.data ?? [];
  const liveRows = useMemo(
    () => (liveCatalogQuery.data?.data ?? []).slice(0, 3),
    [liveCatalogQuery.data?.data],
  );

  const filteredRows = useMemo(() => {
    let filtered = rows
      .filter((s) => s.status === "completed")
      .sort((a, b) => {
        if (a.replayReady !== b.replayReady) return a.replayReady ? -1 : 1;
        if (a.hasFrames !== b.hasFrames) return a.hasFrames ? -1 : 1;
        return new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime();
      });

    if (filter !== "all") {
      filtered = filtered.filter((s) =>
        s.sessionType.toLowerCase().includes(filter),
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.meetingName.toLowerCase().includes(q) ||
          s.sessionName.toLowerCase().includes(q),
      );
    }

    return filtered;
  }, [rows, filter, searchQuery]);

  const filters: { label: string; value: FilterType }[] = [
    { label: "All", value: "all" },
    { label: "Race", value: "race" },
    { label: "Quali", value: "qualifying" },
    { label: "Practice", value: "practice" },
    { label: "Sprint", value: "sprint" },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Alpha Banner */}
      <div className="border-b border-[var(--warning)]/30 bg-[var(--warning)]/8 px-4 py-1.5 text-center text-[11px] uppercase tracking-[0.1em] text-[var(--warning)]">
        <span className="inline-flex items-center gap-2">
          <AlertTriangle className="size-3" />
          Alpha — features may be incomplete or change without notice
        </span>
      </div>

      {/* Hero Section */}
      <div className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                <PlaySquare className="size-3" />
                Session Replay
              </div>
              <h1 className="text-xl font-bold">
                Simulate
              </h1>
              <p className="max-w-xl text-[12px] leading-relaxed text-[var(--muted-foreground)]">
                Replay any practice, qualifying, or race with full live timing
                data. Adjustable playback from 0.5x to 16x with team radio, race
                control messages, and real-time track positions.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="inline-flex items-center gap-3 border border-[var(--border)] bg-[var(--panel)] px-3 py-2">
                <Gauge className="size-4 text-[var(--primary)]" />
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
                    Speed
                  </div>
                  <div className="text-[12px] font-bold">0.5x – 16x</div>
                </div>
              </div>
              <div className="inline-flex items-center gap-3 border border-[var(--border)] bg-[var(--panel)] px-3 py-2">
                <Layers className="size-4 text-[var(--primary)]" />
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
                    Layers
                  </div>
                  <div className="text-[12px] font-bold">
                    Timing · Radio · GPS
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Sessions Banner */}
      {liveRows.length > 0 && (
        <div className="border-b border-[var(--border)] bg-[var(--primary)]/5">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping bg-red-400 opacity-75" />
                <span className="relative inline-flex size-1.5 bg-red-500" />
              </span>
              Live Now
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {liveRows.map((session) => (
                <Link
                  key={`live-${session.sessionKey}`}
                  href="/dashboard"
                  className="group flex items-center justify-between border border-[var(--primary)]/30 bg-[var(--primary)]/8 p-3 transition-colors hover:bg-[var(--primary)]/14"
                >
                  <div>
                    <div className="text-[12px] font-bold">{session.meetingName}</div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      {session.sessionName}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--primary)]">
                    <Radio className="size-3.5" />
                    Live
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-1 overflow-x-auto">
            <Filter className="mr-1 size-3.5 shrink-0 text-[var(--muted-foreground)]" />
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`whitespace-nowrap border px-2.5 py-1 text-[11px] uppercase tracking-[0.1em] transition-colors ${
                  filter === f.value
                    ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-[var(--border)] bg-[var(--panel)] py-1.5 pl-8 pr-3 text-[12px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none sm:w-56"
            />
          </div>
        </div>
      </div>

      {/* Session Grid */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[13px] font-bold">
              Completed Sessions
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
              <NumberFlow value={filteredRows.length} /> session{filteredRows.length !== 1 ? "s" : ""} available
            </p>
          </div>
        </div>

        {/* Loading State */}
        {catalogQuery.isLoading && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse border border-[var(--border)] bg-[var(--panel)] p-4"
              >
                <div className="mb-3 h-4 w-2/3 bg-white/5" />
                <div className="mb-2 h-3 w-1/2 bg-white/5" />
                <div className="mb-4 h-3 w-1/3 bg-white/5" />
                <div className="h-7 w-24 bg-white/5" />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!catalogQuery.isLoading && filteredRows.length === 0 && (
          <div className="flex flex-col items-center justify-center border border-[var(--border)] bg-[var(--panel)] py-12 text-center">
            <Flag className="mb-3 size-6 text-[var(--muted-foreground)]" />
            <div className="text-[12px] font-semibold text-[var(--muted-foreground)]">
              No sessions found
            </div>
            <div className="mt-1 text-[11px] text-[var(--muted-foreground)]">
              {searchQuery
                ? "Try adjusting your search query"
                : "No completed sessions match this filter yet"}
            </div>
          </div>
        )}

        {/* Session Cards */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRows.map((session) => (
            <Link
              key={`sim-${session.sessionKey}`}
              href={`/sessions/${session.sessionKey}/simulate`}
              className="group relative flex flex-col overflow-hidden border border-[var(--border)] bg-[var(--panel)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--panel-elevated)]"
            >
              {/* Card Header */}
              <div className="border-b border-[var(--border)] px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${sessionTypeColor(session.sessionType)}`}
                  >
                    {session.sessionType}
                  </span>
                  {session.replayReady && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                      <Play className="size-2.5" />
                      Ready
                    </span>
                  )}
                </div>
                <h3 className="text-[13px] font-bold group-hover:text-[var(--foreground)]">
                  {session.meetingName}
                </h3>
                <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                  {session.sessionName}
                </div>
              </div>

              {/* Card Body */}
              <div className="flex grow flex-col justify-between px-4 py-3">
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
                    <Calendar className="size-3" />
                    {formatDate(session.startsAt)}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
                    <Clock className="size-3" />
                    {formatTime(session.startsAt)}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
                    <Layers className="size-3" />
                    <NumberFlow value={session.frameCount} /> frames
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
                    <Timer className="size-3" />
                    <NumberFlow value={session.driverCount} /> drivers
                  </div>
                </div>

                {/* Action */}
                <div className="flex items-center justify-between border-t border-[var(--border)] pt-2.5 text-[11px] uppercase tracking-[0.1em] text-[var(--muted-foreground)] transition-colors group-hover:text-[var(--primary)]">
                  <span>Open Replay</span>
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Features Footer */}
      <div className="border-t border-[var(--border)]">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          {[
            {
              icon: PlaySquare,
              title: "Full Session Replay",
              desc: "Replay any F1 session with complete timing data at adjustable speeds",
            },
            {
              icon: Radio,
              title: "Team Radio",
              desc: "Listen to driver communications with AI-powered transcription",
            },
            {
              icon: Flag,
              title: "Race Control",
              desc: "Track flags, penalties, and official race control messages",
            },
            {
              icon: Gauge,
              title: "Live Track Map",
              desc: "Watch drivers move around the circuit in real-time 2D and 3D views",
            },
          ].map((feature) => (
            <div key={feature.title} className="space-y-1.5">
              <feature.icon className="size-4 text-[var(--primary)]" />
              <div className="text-[12px] font-semibold">{feature.title}</div>
              <div className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                {feature.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
