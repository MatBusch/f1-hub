"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, Github, KeyRound, Mail } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { normalizeCallbackPath } from "@/lib/server/auth-paths";
import { PixelF1Car } from "@/components/auth/pixel-f1-car";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type InviteSummary = {
  token: string;
  email: string | null;
  name: string | null;
  status: "not-found" | "pending" | "accepted" | "expired" | "revoked";
};

type AuthScreenProps = {
  invite?: InviteSummary | null;
  returnTo?: string;
  socialProviders: Array<{
    id: "github" | "google";
    label: string;
  }>;
};

function getInviteMessage(invite?: InviteSummary | null) {
  switch (invite?.status) {
    case "pending":
      return "Your invite is active. Use the invited email or a matching social account to create access.";
    case "accepted":
      return "This invite has already been redeemed. Sign in with the account you created.";
    case "expired":
      return "This invite expired. Ask for a fresh link.";
    case "revoked":
      return "This invite was revoked. Ask for a new one.";
    case "not-found":
      return "That invite link is not valid.";
    default:
      return "Invite-only access. Existing members can sign in directly, and new members need an active invite.";
  }
}

export function AuthScreen({
  invite,
  returnTo,
  socialProviders,
}: AuthScreenProps) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [email, setEmail] = useState(invite?.email ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const callbackPath = useMemo(
    () => normalizeCallbackPath(returnTo),
    [returnTo],
  );
  const inviteLocked = invite?.status === "pending" && Boolean(invite.email);
  const effectiveEmail = inviteLocked ? (invite?.email ?? "") : email.trim();

  const providerIcons = {
    github: Github,
    google: ArrowRight,
  } as const;

  if (session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(217,4,41,0.2),transparent_40%),linear-gradient(180deg,var(--background),color-mix(in_oklab,var(--background),black_8%))] px-4 py-10">
        <Card className="w-full max-w-lg border-[var(--border-strong)]">
          <CardHeader>
            <CardTitle className="text-sm">Already signed in</CardTitle>
            <CardDescription>
              Continue to your workspace or manage passkeys for this account.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={callbackPath}>Open workspace</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/account/security">Manage passkeys</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(217,4,41,0.2),transparent_40%),linear-gradient(180deg,var(--background),color-mix(in_oklab,var(--background),black_8%))] px-4 py-10">
      <Card className="w-full max-w-2xl overflow-hidden border-[var(--border-strong)]">
        <div className="grid gap-0 md:grid-cols-[0.9fr_1.1fr]">
          <div className="border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--panel),black_8%)] p-6 md:border-b-0 md:border-r">
            <div className="mb-5 inline-flex items-center gap-2 border border-[var(--border)] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              <BadgeCheck className="size-3.5 text-[var(--primary)]" />
              Invite access
            </div>
            <div className="space-y-4">
              <PixelF1Car />
              <div className="space-y-2">
                <h1 className="text-base font-semibold uppercase tracking-[0.08em] text-[var(--foreground)]">
                  F1 Hub auth gate
                </h1>
                <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                  {getInviteMessage(invite)}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <CardHeader className="border-b-0 px-0 pb-4 pt-0">
              <CardTitle className="text-sm">Sign in</CardTitle>
              <CardDescription>
                Magic links, social sign-in, and passkeys are enabled. Passkeys
                are added after your first invited sign-in.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 px-0 pb-0">
              {error ? (
                <div className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
                  {error}
                </div>
              ) : null}

              {message ? (
                <div className="border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-100">
                  {message}
                </div>
              ) : null}

              <div className="grid gap-2">
                {socialProviders.map((provider) => {
                  const Icon = providerIcons[provider.id];

                  return (
                    <Button
                      key={provider.id}
                      variant="outline"
                      disabled={isPending}
                      onClick={() => {
                        setError(null);
                        setMessage(null);
                        startTransition(async () => {
                          const result = await authClient.signIn.social({
                            provider: provider.id,
                            callbackURL: callbackPath,
                            newUserCallbackURL: callbackPath,
                            loginHint: effectiveEmail || undefined,
                            additionalData: invite?.token
                              ? { inviteToken: invite.token }
                              : undefined,
                          });

                          if ("error" in result && result.error) {
                            setError(
                              result.error.message ?? "Social sign-in failed.",
                            );
                          }
                        });
                      }}
                    >
                      <Icon className="size-3.5" />
                      Continue with {provider.label}
                    </Button>
                  );
                })}
              </div>

              <div className="border-t border-[var(--border)] pt-4">
                <label className="mb-2 block text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  Invite email
                </label>
                <input
                  className="w-full border border-[var(--border-strong)] bg-[var(--background)] px-3 py-2 text-[12px] outline-none transition-colors focus:border-[var(--primary)]"
                  disabled={inviteLocked || isPending}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="team@f1hub.dev"
                  type="email"
                  value={effectiveEmail}
                />
                <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
                  {inviteLocked
                    ? "This invite is locked to the email above."
                    : "Use the invited email for magic-link sign-in."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!effectiveEmail || isPending}
                  onClick={() => {
                    setError(null);
                    setMessage(null);
                    startTransition(async () => {
                      const accessResponse = await fetch("/api/auth/access", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          email: effectiveEmail,
                        }),
                      });

                      if (!accessResponse.ok) {
                        const payload = (await accessResponse
                          .json()
                          .catch(() => null)) as { error?: string } | null;

                        setError(
                          payload?.error ??
                            "That email does not have access yet.",
                        );
                        return;
                      }

                      const result = await authClient.signIn.magicLink({
                        email: effectiveEmail,
                        name: invite?.name ?? undefined,
                        callbackURL: callbackPath,
                        newUserCallbackURL: callbackPath,
                      });

                      if ("error" in result && result.error) {
                        setError(
                          result.error.message ?? "Magic link sign-in failed.",
                        );
                        return;
                      }

                      setMessage(
                        `Magic link sent to ${effectiveEmail}. Check the console or your email provider configuration.`,
                      );
                    });
                  }}
                >
                  <Mail className="size-3.5" />
                  {isPending ? "Sending..." : "Send magic link"}
                </Button>

                <Button
                  variant="outline"
                  disabled={isPending}
                  onClick={() => {
                    setError(null);
                    setMessage(null);
                    startTransition(async () => {
                      const result = await authClient.signIn.passkey();

                      if (result.error) {
                        setError(
                          result.error.message ?? "Passkey sign-in failed.",
                        );
                        return;
                      }

                      router.replace(callbackPath);
                      router.refresh();
                    });
                  }}
                >
                  <KeyRound className="size-3.5" />
                  Use passkey
                </Button>
              </div>

              <div className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                Existing members can also sign in without an invite link once
                their account exists. New access still requires an active
                invite.
              </div>
            </CardContent>
          </div>
        </div>
      </Card>
    </main>
  );
}
