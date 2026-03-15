"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, UserCircle2 } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function AuthStatus() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        Session
      </div>
    );
  }

  if (!session) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href="/sign-in">Sign in</Link>
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-[10px] uppercase tracking-[0.14em]">
      <div className="flex items-center gap-2 text-[var(--foreground)]">
        <UserCircle2 className="size-3.5 text-[var(--primary)]" />
        <div className="min-w-0">
          <div className="truncate">{session.user.name}</div>
          <div className="truncate text-[var(--muted-foreground)]">
            {session.user.email}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/account/security">
            <Shield className="size-3.5" />
            Security
          </Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await authClient.signOut();
            router.push("/sign-in");
            router.refresh();
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
