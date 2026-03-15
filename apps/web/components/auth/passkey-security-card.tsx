"use client";

import { useState, useTransition } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function PasskeySecurityCard() {
  const { data: session } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <section className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <Card className="border-[var(--border-strong)]">
        <CardHeader className="gap-3">
          <div className="inline-flex w-fit items-center gap-2 border border-[var(--border)] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
            <ShieldCheck className="size-3.5 text-[var(--primary)]" />
            Account security
          </div>
          <CardTitle className="text-sm">
            Register a passkey for faster sign-in
          </CardTitle>
          <CardDescription className="max-w-xl leading-relaxed">
            Passkeys are tied to your existing invited account. Use Google,
            GitHub, or your invite email once, then register a device here for
            passwordless sign-in later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-sm border border-[var(--border)] bg-[var(--background)] px-3 py-3 text-[11px] text-[var(--muted-foreground)]">
            Signed in as{" "}
            <span className="font-medium text-[var(--foreground)]">
              {session?.user.email ?? "unknown user"}
            </span>
          </div>

          {error ? (
            <div className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-100">
              {success}
            </div>
          ) : null}

          <Button
            onClick={() => {
              setError(null);
              setSuccess(null);
              startTransition(async () => {
                const result = await authClient.passkey.addPasskey({
                  name: "Primary F1 Hub passkey",
                });

                if (result.error) {
                  setError(result.error.message ?? "Failed to register passkey.");
                  return;
                }

                setSuccess("Passkey registered. You can now use it from sign-in.");
              });
            }}
            disabled={isPending}
          >
            <KeyRound className="size-3.5" />
            {isPending ? "Registering..." : "Add passkey"}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
