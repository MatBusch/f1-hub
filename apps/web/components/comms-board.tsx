"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LiveEnvelope } from "@f1-hub/contracts";
import { ArrowRight, Mic } from "lucide-react";

import { fetchSessionCatalog } from "@/lib/api";
import {
  useLiveSessionController,
  useLiveSessionStore,
} from "@/lib/live-session-store";
import { getSessionState } from "@/lib/session-insights";
import {
  MetricPanel,
  PanelShell,
  RaceControlPanel,
  SessionSwitcherPanel,
  SignalFeedPanel,
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

function stringifyPayload(payload: unknown) {
  try {
    const text = JSON.stringify(payload);
    return text.length > 180 ? `${text.slice(0, 180)}...` : text;
  } catch {
    return "payload unavailable";
  }
}

type DecodedRadioCard = {
  title: string;
  subtitle: string;
  timestamp: string;
  lines: string[];
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function decodeTeamRadioCard(
  payload: unknown,
  fallbackTimestamp: string,
): DecodedRadioCard {
  const record = asRecord(payload);
  const captures = Array.isArray(record?.Captures)
    ? record.Captures.map((entry) => asRecord(entry)).filter(Boolean)
    : [];
  const firstCapture = captures[0] ?? null;
  const racingNumber =
    asString(record?.RacingNumber) ??
    asString(firstCapture?.RacingNumber) ??
    asString(record?.DriverNum) ??
    "Unknown driver";
  const transcript =
    asString(record?.Transcript) ??
    asString(firstCapture?.Transcript) ??
    asString(record?.Message) ??
    asString(firstCapture?.Message) ??
    asString(record?.Path) ??
    asString(firstCapture?.Path) ??
    "Radio payload received";
  const source =
    asString(record?.Path) ??
    asString(firstCapture?.Path) ??
    asString(record?.RecordingUrl) ??
    asString(firstCapture?.RecordingUrl) ??
    "No decoded media URL yet";
  const emittedAt =
    asString(record?.Utc) ?? asString(firstCapture?.Utc) ?? fallbackTimestamp;

  return {
    title: `Driver ${racingNumber}`,
    subtitle: "Team Radio",
    timestamp: emittedAt,
    lines: [transcript, source],
  };
}

function decodeEnvelopeCard(envelope: LiveEnvelope): DecodedRadioCard {
  if (envelope.topic === "teamRadio") {
    return decodeTeamRadioCard(envelope.payload, envelope.emittedAt);
  }

  if (envelope.topic === "raceControl") {
    return {
      title: "Race Control",
      subtitle: "Control message",
      timestamp: envelope.emittedAt,
      lines: [stringifyPayload(envelope.payload)],
    };
  }

  return {
    title: "Session Update",
    subtitle: "Session signal",
    timestamp: envelope.emittedAt,
    lines: [stringifyPayload(envelope.payload)],
  };
}

export function CommsBoard() {
  const [selectedSessionKey, setSelectedSessionKey] = useState<number | null>(
    null,
  );

  const liveSessionsQuery = useQuery({
    queryKey: ["sessions", "comms-live-catalog"],
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
      if (
        current &&
        liveSessions.some((session) => session.sessionKey === current)
      ) {
        return current;
      }

      return liveSessions[0]!.sessionKey;
    });
  }, [liveSessions]);

  const activeSession = useMemo(
    () =>
      liveSessions.find((session) => session.sessionKey === selectedSessionKey),
    [liveSessions, selectedSessionKey],
  );
  const activeSessionKey = activeSession?.sessionKey;

  useLiveSessionController(activeSessionKey ?? null);

  const liveStatus = useLiveSessionStore((state) => state.status);
  const summary = useLiveSessionStore((state) => state.summary);
  const boot = useLiveSessionStore((state) => state.boot);
  const liveWindow = useLiveSessionStore((state) => state.liveWindow);
  const raceControl = useLiveSessionStore((state) => state.raceControl);

  const sessionState = useMemo(
    () => getSessionState(boot ?? undefined),
    [boot],
  );
  const commsSignals = useMemo(
    () =>
      [...liveWindow]
        .filter(
          (envelope) =>
            envelope.topic === "teamRadio" ||
            envelope.topic === "raceControl" ||
            envelope.topic === "session",
        )
        .sort((left, right) => right.sequence - left.sequence)
        .slice(0, 12),
    [liveWindow],
  );
  const decodedComms = useMemo(
    () =>
      commsSignals.map((signal) => ({
        signal,
        card: decodeEnvelopeCard(signal),
      })),
    [commsSignals],
  );

  if (
    liveSessionsQuery.isLoading ||
    (activeSessionKey !== undefined && liveStatus === "loading")
  ) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--accent-soft),transparent_28%),linear-gradient(180deg,var(--background),var(--background-elevated))]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 md:px-8 md:py-10">
          <Card className="min-h-[14rem] animate-pulse bg-[var(--panel)]" />
          <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <Card className="min-h-[28rem] animate-pulse bg-[var(--panel)]" />
            <Card className="min-h-[28rem] animate-pulse bg-[var(--panel)]" />
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
              <CardTitle>No live comms board available</CardTitle>
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
        <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
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
              title="Comms Context"
              description="Session and control-room state around the communication feed."
            >
              <div className="grid gap-3">
                <MetricPanel
                  label="Clock"
                  value={sessionState?.clock ?? "--:--:--"}
                  hint="Official remaining time"
                />
                <MetricPanel
                  label="Track"
                  value={
                    sessionState?.trackMessage ??
                    sessionState?.trackStatus ??
                    "Unknown"
                  }
                  hint="Current control condition"
                />
                <MetricPanel
                  label="Signals"
                  value={`${commsSignals.length}`}
                  hint="Recent comms-oriented envelopes"
                />
              </div>
            </PanelShell>
          </div>

          <div className="space-y-6">
            <Card className="overflow-hidden border-[color-mix(in_oklab,var(--border),var(--primary)_20%)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--panel),white_3%),var(--panel-elevated))]">
              <CardHeader>
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                  <Mic className="size-3.5" />
                  Live comms board
                </div>
                <CardTitle className="text-4xl tracking-[-0.04em] md:text-6xl">
                  {activeSession?.meetingName ?? "Comms Board"}
                </CardTitle>
                <CardDescription className="max-w-2xl text-base leading-7 text-[var(--muted-foreground)]">
                  {activeSession?.sessionName ?? "Current session"} with race
                  control, radio-adjacent signals, and session updates grouped
                  into a single surface.
                </CardDescription>
              </CardHeader>
            </Card>

            <section className="grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
              <RaceControlPanel messages={raceControl} />
              <SignalFeedPanel envelopes={commsSignals} />
            </section>

            <PanelShell
              title="Comms Cards"
              description="Decoded team radio cards with raw fallback for the rest."
            >
              <div className="space-y-3">
                {decodedComms.length === 0 ? (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    No comms-focused signals yet.
                  </p>
                ) : (
                  decodedComms.map(({ signal, card }) => (
                    <div
                      key={signal.sequence}
                      className="rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel-elevated)] p-3"
                    >
                      <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]">
                        <span className="uppercase tracking-[0.18em]">
                          {card.subtitle}
                        </span>
                        <span>{formatDate(card.timestamp)}</span>
                      </div>
                      <div className="mt-2 text-sm font-medium text-[var(--foreground)]">
                        {card.title}
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-[var(--muted-foreground)]">
                        {card.lines.map((line, index) => (
                          <div key={index} className="break-all">
                            {line}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PanelShell>

            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/dashboard">
                  Open dashboard
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
