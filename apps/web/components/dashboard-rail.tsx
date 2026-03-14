"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ChevronRight,
  LayoutDashboard,
  PlaySquare,
  Waves,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const primaryLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/simulate", label: "Replay", icon: PlaySquare },
  { href: "/telemetry", label: "Telemetry", icon: Waves },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardRail() {
  const pathname = usePathname();

  return (
    <aside className="hidden border-r border-[var(--border)] bg-[var(--panel)] lg:block">
      <div className="sticky top-0 flex h-screen flex-col gap-4 px-3 py-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 border border-[var(--border-strong)] bg-[var(--background)] px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em]"
        >
          <Activity className="size-3.5 text-[var(--primary)]" />
          F1 Hub
        </Link>

        <div className="space-y-1">
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
                className={`flex items-center justify-between border px-3 py-2.5 text-[11px] uppercase tracking-[0.16em] transition-colors ${
                  active
                    ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--muted)]"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Icon className="size-3.5" />
                  {link.label}
                </span>
                <ChevronRight className="size-3.5 opacity-50" />
              </Link>
            );
          })}
        </div>

        <div className="mt-auto flex items-center justify-between border border-[var(--border)] bg-[var(--background)] px-3 py-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Theme
          </span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
