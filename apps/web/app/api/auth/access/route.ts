import { canAccessInviteOnlyAuth } from "@/lib/server/auth-access";

type AccessRequest = {
  email?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as AccessRequest | null;
  const email = body?.email?.trim();

  if (!email) {
    return Response.json(
      {
        ok: false,
        error: "Email is required.",
      },
      { status: 400 },
    );
  }

  const hasAccess = await canAccessInviteOnlyAuth(email);

  if (!hasAccess) {
    return Response.json(
      {
        ok: false,
        error:
          "That email does not have access yet. Use an invited email address or ask for an invite.",
      },
      { status: 403 },
    );
  }

  return Response.json({ ok: true });
}
