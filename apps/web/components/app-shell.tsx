"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  LayoutDashboard,
  PlaySquare,
  Waves,
} from "lucide-react";

import { DashboardRail } from "@/components/dashboard-rail";
import { ThemeToggle } from "@/components/theme-toggle";

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

const primaryLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/simulate", label: "Replay", icon: PlaySquare },
  { href: "/telemetry", label: "Telemetry", icon: Waves },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/replica" || pathname.startsWith("/replica/")) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
      <DashboardRail />

      <div className="min-w-0">
        <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--panel)] lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2">
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="inline-flex items-center gap-2 border border-[var(--border-strong)] bg-[var(--background)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--foreground)]"
              >
                <Activity className="size-3.5 text-[var(--primary)]" />
                F1 Hub
              </Link>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto">
              <ThemeToggle />
              <nav className="flex items-center gap-1 overflow-x-auto">
                {primaryLinks.map((link) => {
                  const Icon = link.icon;
                  const active = isActive(pathname, link.href);

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[11px] uppercase tracking-[0.1em] transition-colors ${
                        active
                          ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                          : "border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--muted)]"
                      }`}
                    >
                      <Icon className="size-3.5" />
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
