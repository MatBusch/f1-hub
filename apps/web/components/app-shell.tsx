"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Copy, LayoutDashboard, Map, Mic, PlaySquare, TimerReset, Waves } from "lucide-react";

import { DashboardRail } from "@/components/dashboard-rail";

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

const primaryLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/timing", label: "Timing", icon: TimerReset },
  { href: "/comms", label: "Comms", icon: Mic },
  { href: "/map", label: "Map", icon: Map },
  { href: "/clone", label: "Clone", icon: Copy },
  { href: "/simulate", label: "Replay", icon: PlaySquare },
  { href: "/telemetry", label: "Telemetry", icon: Waves },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/replica" || pathname.startsWith("/replica/")) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <DashboardRail />

      <div className="min-w-0">
        <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--panel),white_8%)]/92 backdrop-blur-xl lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm font-semibold tracking-[0.18em] text-[var(--foreground)] uppercase"
            >
              <Activity className="size-4 text-[var(--primary)]" />
              F1 Hub
            </Link>

            <nav className="flex items-center gap-2 overflow-x-auto">
              {primaryLinks.map((link) => {
                const Icon = link.icon;
                const active = isActive(pathname, link.href);

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors ${
                      active
                        ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                        : "border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)] hover:bg-[var(--muted)]"
                    }`}
                  >
                    <Icon className="size-4" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
