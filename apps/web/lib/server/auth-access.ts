import { eq } from "drizzle-orm";

import { authDb, schema } from "@/lib/server/db/client";
import { getPendingInviteForEmail } from "@/lib/server/invitations";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function getExistingUserByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const [record] = await authDb
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, normalizedEmail))
    .limit(1);

  return record ?? null;
}

export async function canAccessInviteOnlyAuth(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const [existingUser, pendingInvite] = await Promise.all([
    getExistingUserByEmail(normalizedEmail),
    getPendingInviteForEmail(normalizedEmail),
  ]);

  return Boolean(existingUser || pendingInvite);
}
