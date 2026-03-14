"use client";

import Link from "next/link";
import type { LiveEnvelope, RaceControlMessage } from "@f1-hub/contracts";
import { ArrowRight, Radio, Waves, Wind } from "lucide-react";

import { getLeaderboard } from "@/lib/session-insights";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type TimingRow = ReturnType<typeof getLeaderboard>[number];

function sectorTone(row: TimingRow, index: number) {
  const sector = row.sectors[index];

  if (!sector) {
    return "bg-white/10";
  }

  if (sector.overallFastest) {
    return "bg-fuchsia-500";
  }

  if (sector.personalFastest) {
    return "bg-emerald-500";
  }

  if (sector.stopped) {
    return "bg-amber-500";
  }

  return "bg-white/25";
}

function tireAgeTone(stintLaps: number | undefined) {
  if (stintLaps === undefined) {
    return "border-[var(--border)] text-[var(--muted-foreground)]";
  }

  if (stintLaps >= 30) {
    return "border-[var(--destructive)]/40 bg-[color-mix(in_oklab,var(--destructive),white_88%)] text-[var(--destructive)]";
  }

  if (stintLaps >= 20) {
    return "border-[var(--warning)]/45 bg-[color-mix(in_oklab,var(--warning),white_88%)] text-[color-mix(in_oklab,var(--warning),black_28%)]";
  }

  return "border-[var(--success)]/35 bg-[color-mix(in_oklab,var(--success),white_90%)] text-[color-mix(in_oklab,var(--success),black_24%)]";
}

function rowStateClasses(row: TimingRow) {
  if (row.retired) {
    return "border-[var(--destructive)]/35 bg-[color-mix(in_oklab,var(--destructive),white_92%)] opacity-70";
  }

  if (row.stopped) {
    return "border-[var(--warning)]/35 bg-[color-mix(in_oklab,var(--warning),white_92%)]";
  }

  if (row.inPit) {
    return "border-[var(--info)]/35 bg-[color-mix(in_oklab,var(--info),white_93%)]";
  }

  return "border-[var(--border)] bg-[var(--panel-elevated)]";
}

function rowStateLabel(row: TimingRow) {
  if (row.retired) {
    return "retired";
  }

  if (row.stopped) {
    return "stopped";
  }

  if (row.inPit) {
    return "in pit";
  }

  return null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function PanelShell({ title, description, children, className = "" }: { title: string; description?: string; children: React.ReactNode; className?: string; }) {
  return (
    <Card className={`bg-[var(--panel)]/95 ${className}`.trim()}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base tracking-[-0.02em]">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function SessionSwitcherPanel({ sessions, activeSessionKey, onSelect }: { sessions: Array<{ sessionKey: number; sessionName: string; meetingName: string }>; activeSessionKey?: number; onSelect: (sessionKey: number) => void; }) {
  return (
    <PanelShell title="Live Sessions" description="Switch the control room between active sessions.">
      <div className="space-y-2">
        {sessions.map((session) => (
          <button
            key={session.sessionKey}
            type="button"
            onClick={() => onSelect(session.sessionKey)}
            className={`flex w-full items-center justify-between rounded-(--radius-md) border px-3 py-3 text-left transition-colors ${session.sessionKey === activeSessionKey ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)] bg-[var(--panel-elevated)] hover:bg-[var(--muted)]"}`}
          >
            <div>
              <div className="font-medium">{session.sessionName}</div>
              <div className="text-xs opacity-80">{session.meetingName}</div>
            </div>
            <span className="text-[10px] uppercase tracking-[0.18em]">Live</span>
          </button>
        ))}
      </div>
    </PanelShell>
  );
}

export function MetricPanel({ label, value, hint }: { label: string; value: string; hint: string; }) {
  return (
    <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">{value}</div>
      <div className="mt-1 text-xs text-[var(--muted-foreground)]">{hint}</div>
    </div>
  );
}

export function TimingTowerPanel({ rows }: { rows: TimingRow[] }) {
  return (
    <PanelShell title="Timing Tower" description="Compact live standings from the normalized session state." className="h-full">
      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">Timing data has not materialized yet.</p>
        ) : (
          rows.slice(0, 12).map((driver) => (
            <div key={driver.racingNumber} className={`grid grid-cols-[48px_1fr_auto] items-center gap-3 rounded-(--radius-md) border px-3 py-2.5 ${rowStateClasses(driver)}`}>
              <div className="text-xl font-semibold tracking-[-0.04em]">P{driver.position}</div>
              <div className="min-w-0">
                <div className="truncate font-medium">{driver.name}</div>
                <div className="truncate text-xs text-[var(--muted-foreground)]">#{driver.racingNumber} {driver.teamName}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {driver.currentCompound ? (
                    <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                      {driver.currentCompound}
                    </span>
                  ) : null}
                  {driver.numberOfPitStops !== undefined ? (
                    <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                      pits {driver.numberOfPitStops}
                    </span>
                  ) : null}
                  {driver.currentStintLaps !== undefined ? (
                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] ${tireAgeTone(driver.currentStintLaps)}`}>
                      stint {driver.currentStintLaps}L
                    </span>
                  ) : null}
                  {rowStateLabel(driver) ? (
                    <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--foreground)]">
                      {rowStateLabel(driver)}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex gap-1">
                  {[0, 1, 2].map((index) => (
                    <span
                      key={index}
                      className={`h-1.5 flex-1 rounded-full ${sectorTone(driver, index)}`}
                    />
                  ))}
                </div>
              </div>
              <div className="text-right text-xs text-[var(--muted-foreground)]">
                <div>{driver.position === 1 ? "Leader" : driver.gapToLeader ?? "-"}</div>
                <div>{driver.lastLapTime ?? "--"}</div>
                <div className="mt-1">{driver.intervalToAhead ?? driver.bestLapTime ?? "--"}</div>
                <div className="mt-1 flex justify-end gap-1 font-mono text-[10px]">
                  {driver.sectors.slice(0, 3).map((sector, index) => (
                    <span
                      key={index}
                      className={`rounded-full px-1.5 py-0.5 ${sectorTone(driver, index)}`}
                    >
                      {sector.value ?? `S${index + 1}`}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </PanelShell>
  );
}

export function RaceControlPanel({ messages }: { messages: RaceControlMessage[] }) {
  return (
    <PanelShell title="Race Control" description="Recent control messages for the active session.">
      <div className="space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No race control messages have landed yet.</p>
        ) : (
          messages.slice(0, 6).map((message) => (
            <div key={`${message.sessionKey}-${message.sequence}`} className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="font-medium">{message.title}</div>
                <div className="text-xs text-[var(--muted-foreground)]">{formatDate(message.emittedAt)}</div>
              </div>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">{message.body}</p>
            </div>
          ))
        )}
      </div>
    </PanelShell>
  );
}

export function SignalFeedPanel({ envelopes }: { envelopes: LiveEnvelope[] }) {
  return (
    <PanelShell title="Signal Feed" description="Thin rolling window of recent live packets.">
      <div className="space-y-2">
        {envelopes.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">Live packets have not appeared yet.</p>
        ) : (
          envelopes.map((envelope) => (
            <div key={envelope.sequence} className="grid gap-2 rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">#{envelope.sequence}</div>
                <div className="text-xs text-[var(--muted-foreground)]">{formatDate(envelope.emittedAt)}</div>
              </div>
              <div className="truncate font-medium text-[var(--foreground)]">{envelope.topic}</div>
            </div>
          ))
        )}
      </div>
    </PanelShell>
  );
}

export function WeatherPanel({ airTemp, trackTemp, humidity, windSpeed, rainfall }: { airTemp?: string | null; trackTemp?: string | null; humidity?: string | null; windSpeed?: string | null; rainfall?: string | null; }) {
  return (
    <PanelShell title="Weather" description="Fast read of current conditions.">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
          <div className="flex items-center gap-2 text-[var(--foreground)]">
            <Waves className="size-4" />
            {airTemp ?? "--"}C air
          </div>
          <div className="mt-1 text-sm text-[var(--muted-foreground)]">{trackTemp ?? "--"}C track</div>
        </div>
        <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4">
          <div className="flex items-center gap-2 text-[var(--foreground)]">
            <Wind className="size-4" />
            {windSpeed ?? "--"} km/h
          </div>
          <div className="mt-1 text-sm text-[var(--muted-foreground)]">Humidity {humidity ?? "--"}% / Rain {rainfall ?? "--"}</div>
        </div>
      </div>
    </PanelShell>
  );
}

export function WorkspaceLinksPanel({ sessionKey }: { sessionKey?: number }) {
  return (
    <PanelShell title="Workspace Stack" description="Jump between the live shell and historical analysis routes.">
      <div className="grid gap-3">
        <div className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-4 text-sm text-[var(--muted-foreground)]">
          Live control room, dedicated map, chunked simulation, and telemetry lab now live as separate workloads.
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/map">Open map<ArrowRight className="size-4" /></Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/simulate"><Radio className="size-4" />Simulate hub</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/telemetry"><Waves className="size-4" />Telemetry hub</Link>
          </Button>
          {sessionKey ? (
            <Button asChild variant="outline">
              <Link href={`/sessions/${sessionKey}`}>Session workspace</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </PanelShell>
  );
}
