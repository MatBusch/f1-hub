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
  if (type.includes("race")) return "bg-red-500/20 text-red-400 border-red-500/30";
  if (type.includes("qualifying") || type.includes("quali"))
    return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  if (type.includes("sprint"))
    return "bg-purple-500/20 text-purple-400 border-purple-500/30";
  return "bg-blue-500/20 text-blue-400 border-blue-500/30";
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
    { label: "All Sessions", value: "all" },
    { label: "Race", value: "race" },
    { label: "Qualifying", value: "qualifying" },
    { label: "Practice", value: "practice" },
    { label: "Sprint", value: "sprint" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white">
      {/* Alpha Banner */}
      <div className="relative overflow-hidden border-b border-amber-500/20 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 px-4 py-2 text-center text-sm font-medium text-black shadow-lg shadow-amber-500/10">
        <span className="inline-flex items-center gap-2">
          <AlertTriangle className="size-4" />
          This site is in very early alpha — features may be incomplete or change
          without notice
          <AlertTriangle className="size-4" />
        </span>
      </div>

      {/* Hero Section */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(225,6,0,0.15),transparent)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium uppercase tracking-widest text-white/60">
                <PlaySquare className="size-3.5" />
                Session Replay
              </div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
                Simulate
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-white/50">
                Replay any practice, qualifying, or race with full live timing
                data. Adjustable playback from 0.5x to 16x with team radio, race
                control messages, and real-time track positions.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="inline-flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <Gauge className="size-5 text-red-500" />
                <div>
                  <div className="text-xs text-white/40">Playback Speed</div>
                  <div className="font-mono text-sm font-bold">0.5x – 16x</div>
                </div>
              </div>
              <div className="inline-flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <Layers className="size-5 text-red-500" />
                <div>
                  <div className="text-xs text-white/40">Data Layers</div>
                  <div className="font-mono text-sm font-bold">
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
        <div className="border-b border-white/5 bg-gradient-to-r from-red-500/5 via-transparent to-red-500/5">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="mb-4 flex items-center gap-2 text-sm text-white/60">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-red-500" />
              </span>
              Live Now
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {liveRows.map((session) => (
                <Link
                  key={`live-${session.sessionKey}`}
                  href="/dashboard"
                  className="group flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/5 p-4 transition-all hover:border-red-500/40 hover:bg-red-500/10"
                >
                  <div>
                    <div className="font-bold">{session.meetingName}</div>
                    <div className="text-sm text-white/50">
                      {session.sessionName}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-red-400">
                    <Radio className="size-4" />
                    Watch Live
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="sticky top-0 z-40 border-b border-white/5 bg-[#0a0a0b]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 overflow-x-auto">
            <Filter className="size-4 shrink-0 text-white/30" />
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  filter === f.value
                    ? "bg-red-500 text-white"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/30 sm:w-64"
            />
          </div>
        </div>
      </div>

      {/* Session Grid */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
              Completed Sessions
            </h2>
            <p className="mt-1 text-sm text-white/40">
              {filteredRows.length} session
              {filteredRows.length !== 1 ? "s" : ""} available for replay
            </p>
          </div>
        </div>

        {/* Loading State */}
        {catalogQuery.isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl border border-white/5 bg-white/[0.03] p-6"
              >
                <div className="mb-4 h-5 w-2/3 rounded bg-white/10" />
                <div className="mb-2 h-4 w-1/2 rounded bg-white/5" />
                <div className="mb-6 h-4 w-1/3 rounded bg-white/5" />
                <div className="h-10 w-28 rounded-lg bg-white/5" />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!catalogQuery.isLoading && filteredRows.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] py-16 text-center">
            <Flag className="mb-4 size-10 text-white/20" />
            <div className="mb-1 text-lg font-semibold text-white/60">
              No sessions found
            </div>
            <div className="text-sm text-white/30">
              {searchQuery
                ? "Try adjusting your search query"
                : "No completed sessions match this filter yet"}
            </div>
          </div>
        )}

        {/* Session Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRows.map((session) => (
            <Link
              key={`sim-${session.sessionKey}`}
              href={`/sessions/${session.sessionKey}/simulate`}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] transition-all hover:border-white/15 hover:bg-white/[0.05]"
            >
              {/* Card Header */}
              <div className="border-b border-white/5 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${sessionTypeColor(session.sessionType)}`}
                  >
                    {session.sessionType}
                  </span>
                  {session.replayReady && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                      <Play className="size-3" />
                      Ready
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold tracking-tight group-hover:text-white">
                  {session.meetingName}
                </h3>
                <div className="mt-1 text-sm text-white/50">
                  {session.sessionName}
                </div>
              </div>

              {/* Card Body */}
              <div className="flex grow flex-col justify-between p-5">
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm text-white/40">
                    <Calendar className="size-3.5" />
                    {formatDate(session.startsAt)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/40">
                    <Clock className="size-3.5" />
                    {formatTime(session.startsAt)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/40">
                    <Layers className="size-3.5" />
                    {session.frameCount.toLocaleString()} frames
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/40">
                    <Timer className="size-3.5" />
                    {session.driverCount} drivers
                  </div>
                </div>

                {/* Action */}
                <div className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-2.5 text-sm font-medium text-white/70 transition-colors group-hover:bg-red-500/20 group-hover:text-red-400">
                  <span>Open Replay</span>
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Features Footer */}
      <div className="border-t border-white/5 bg-white/[0.01]">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
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
            <div key={feature.title} className="space-y-2">
              <feature.icon className="size-5 text-red-500" />
              <div className="text-sm font-semibold">{feature.title}</div>
              <div className="text-sm leading-relaxed text-white/40">
                {feature.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
