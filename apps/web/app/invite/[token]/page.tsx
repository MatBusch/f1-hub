import { redirect } from "next/navigation";

import { listConfiguredSocialProviders } from "@/lib/auth";
import { getServerSession } from "@/lib/server/auth-session";
import { getInviteByToken } from "@/lib/server/invitations";
import { AuthScreen } from "@/components/auth/auth-screen";

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const session = await getServerSession();

  if (session) {
    redirect("/dashboard");
  }

  const invite = await getInviteByToken(token);

  return (
    <AuthScreen
      invite={{
        token,
        email: invite.invite?.email ?? null,
        name: invite.invite?.name ?? null,
        status: invite.status,
      }}
      returnTo="/dashboard"
      socialProviders={listConfiguredSocialProviders()}
    />
  );
}
