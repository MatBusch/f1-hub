"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ChevronRight,
  Copy,
  LayoutDashboard,
  Map,
  Mic,
  PlaySquare,
  TimerReset,
  Waves,
} from "lucide-react";

const primaryLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/timing", label: "Timing", icon: TimerReset },
  { href: "/comms", label: "Comms", icon: Mic },
  { href: "/map", label: "Map", icon: Map },
  { href: "/clone", label: "Clone", icon: Copy },
  { href: "/simulate", label: "Replay", icon: PlaySquare },
  { href: "/telemetry", label: "Telemetry", icon: Waves },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardRail() {
  const pathname = usePathname();

  return (
    <aside className="hidden border-r border-[var(--border)] bg-[color-mix(in_oklab,var(--panel),white_8%)]/88 lg:block">
      <div className="sticky top-0 flex h-screen flex-col gap-6 px-4 py-5 backdrop-blur-xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel)] px-3 py-3 text-sm font-semibold uppercase tracking-[0.18em]"
        >
          <Activity className="size-4 text-[var(--primary)]" />
          F1 Hub
        </Link>

        <div className="space-y-2">
          <div className="px-2 text-[10px] uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
            Workspace
          </div>
          {primaryLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(pathname, link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center justify-between rounded-(--radius-md) border px-3 py-3 text-sm transition-colors ${
                  active
                    ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "border-[var(--border)] bg-[var(--panel)] hover:bg-[var(--muted)]"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Icon className="size-4" />
                  {link.label}
                </span>
                <ChevronRight className="size-4 opacity-70" />
              </Link>
            );
          })}
        </div>

        <div className="space-y-3 rounded-(--radius-md) border border-[var(--border)] bg-[var(--panel)] p-4 text-sm text-[var(--muted-foreground)]">
          <div className="text-[10px] uppercase tracking-[0.22em]">Control Room</div>
          <p>Live race surfaces and historical analysis stay separated so each route can stay fast.</p>
        </div>
      </div>
    </aside>
  );
}
