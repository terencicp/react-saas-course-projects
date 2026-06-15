import 'server-only';

import { and, desc, eq, gt } from 'drizzle-orm';

import { db } from '@/db';
import { invitation } from '@/db/schema/auth';
import { tenantDb } from '@/db/tenant';

// The pending-invites panel's row view. The inviter relation is aliased `user`
// (auth:generate names invitation's one(user) join on inviterId `user`, never
// `inviter`), so the row's `.user` IS the inviter — read its name/email for the
// "invited by" label. acceptUrl is omitted: the raw token is never stored (only its
// sha256), so a pending row cannot reconstruct its signed URL; the seed prints the
// one known URL and the dev Copy button reads it from there.
export type PendingInvitationRow = {
  id: string;
  email: string;
  role: string | null;
  expiresAt: Date;
  acceptUrl?: string;
  user: { name: string; email: string } | null;
};

export const listPendingInvitations = async (
  orgId: string,
): Promise<PendingInvitationRow[]> => {
  const rows = await tenantDb(orgId).query.invitation.findMany({
    where: and(
      eq(invitation.status, 'pending'),
      gt(invitation.expiresAt, new Date()),
    ),
    with: { user: true },
    orderBy: desc(invitation.createdAt),
  });

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expiresAt,
    user: row.user ? { name: row.user.name, email: row.user.email } : null,
  }));
};

// getInvitationById is the deliberate non-scoped read: the invitee is not yet a
// member, so there is no tenant to scope to — the signed token is the authorization
// and the org is derived from the loaded row. Goes through the unwrapped db (never
// tenantDb), and returns the full row so the accept page's verify ladder and the
// accept action can read tokenHash / status / expiresAt / organizationId / role.
export const getInvitationById = async (id: string) =>
  (await db.query.invitation.findFirst({
    where: eq(invitation.id, id),
  })) ?? null;
