import type { Metadata } from "next";
import Script from "next/script";

import { Providers } from "@/app/providers";
import { AppShell } from "@/components/app-shell";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "f1-hub",
  description: "Tinybird-first Formula 1 live and historical dashboard.",
};

const themeBootScript = `
(() => {
  const storageKey = "f1-hub-theme";
  const stored = window.localStorage.getItem(storageKey) ?? "system";
  const preference = stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  const resolved = preference === "system" ? systemTheme : preference;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Script id="theme-boot" strategy="beforeInteractive">
          {themeBootScript}
        </Script>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
