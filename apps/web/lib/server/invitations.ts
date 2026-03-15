import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";

import { authDb } from "@/lib/server/db/client";
import { invite } from "@/lib/server/db/schema";
import { getAppBaseUrl } from "@/lib/server/auth-paths";

export type InviteRecord = typeof invite.$inferSelect;
export type InviteStatus =
  | "not-found"
  | "pending"
  | "accepted"
  | "expired"
  | "revoked";

export type InviteLookup = {
  invite: InviteRecord | null;
  status: InviteStatus;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function randomToken() {
  return randomBytes(24).toString("base64url");
}

function resolveInviteStatus(record: InviteRecord | undefined): InviteLookup {
  if (!record) {
    return { invite: null, status: "not-found" };
  }

  if (record.revokedAt) {
    return { invite: record, status: "revoked" };
  }

  if (record.acceptedAt) {
    return { invite: record, status: "accepted" };
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    return { invite: record, status: "expired" };
  }

  return { invite: record, status: "pending" };
}

export async function createInvite(input: {
  email: string;
  name?: string;
  invitedBy?: string;
  note?: string;
  expiresInHours?: number;
}) {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + (input.expiresInHours ?? 72) * 60 * 60 * 1000,
  );

  const [createdInvite] = await authDb
    .insert(invite)
    .values({
      id: randomUUID(),
      token: randomToken(),
      email: normalizeEmail(input.email),
      name: input.name ?? null,
      invitedBy: input.invitedBy ?? null,
      note: input.note ?? null,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!createdInvite) {
    throw new Error("Failed to create invite.");
  }

  return {
    invite: createdInvite,
    url: `${getAppBaseUrl()}/invite/${createdInvite.token}`,
  };
}

export async function getInviteByToken(token: string) {
  const [record] = await authDb
    .select()
    .from(invite)
    .where(eq(invite.token, token))
    .limit(1);

  return resolveInviteStatus(record);
}

export async function getPendingInviteForEmail(email: string) {
  const [record] = await authDb
    .select()
    .from(invite)
    .where(
      and(
        eq(invite.email, normalizeEmail(email)),
        isNull(invite.acceptedAt),
        isNull(invite.revokedAt),
        gt(invite.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(invite.createdAt))
    .limit(1);

  return record ?? null;
}

export async function markInviteAccepted(email: string, userId: string) {
  await authDb
    .update(invite)
    .set({
      acceptedAt: new Date(),
      acceptedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(invite.email, normalizeEmail(email)),
        isNull(invite.acceptedAt),
        isNull(invite.revokedAt),
      ),
    );
}
