import { redirect } from "next/navigation";

import { listConfiguredSocialProviders } from "@/lib/auth";
import { normalizeCallbackPath } from "@/lib/server/auth-paths";
import { getServerSession } from "@/lib/server/auth-session";
import { getInviteByToken } from "@/lib/server/invitations";
import { AuthScreen } from "@/components/auth/auth-screen";

type SignInPageProps = {
  searchParams: Promise<{
    invite?: string;
    returnTo?: string;
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const resolvedSearchParams = await searchParams;
  const returnTo = normalizeCallbackPath(resolvedSearchParams.returnTo);
  const session = await getServerSession();

  if (session) {
    redirect(returnTo);
  }

  const inviteToken = resolvedSearchParams.invite;
  const invite = inviteToken
    ? await getInviteByToken(inviteToken)
    : { invite: null, status: "not-found" as const };

  return (
    <AuthScreen
      invite={
        invite.invite || inviteToken
          ? {
              token: inviteToken ?? "",
              email: invite.invite?.email ?? null,
              name: invite.invite?.name ?? null,
              status: inviteToken ? invite.status : "not-found",
            }
          : null
      }
      returnTo={returnTo}
      socialProviders={listConfiguredSocialProviders()}
    />
  );
}
