'use server';

import { and, eq } from 'drizzle-orm';
import type { Route } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { auditLogs } from '@/db/audit';
import { getInvitationById } from '@/db/queries/invitations';
import { invitation, member, user } from '@/db/schema/auth';
import { withTenant } from '@/db/tenant';
import { auth, getCurrentUser } from '@/lib/auth';
import { sha256 } from '@/lib/invitations/url';
import type { Result } from '@/lib/result';
import { err } from '@/lib/result';

// Module-local, NOT exported: a "use server" module may export only async functions
// (Next 16.2.7 rejects a non-function export at runtime). id is the Better Auth
// invitation text id — z.string().min(1), never z.uuid().
const acceptInvitationSchema = z.strictObject({
  id: z.string().min(1),
  token: z.string(),
});

// Accept is NOT an authedAction: the signed invitation is the authority, not a role.
// The POST is a separate request from the page render, so the action re-verifies the
// token independently (hash / expiry / status) — sig is not an action input. The
// member insert, the invitation status flip (guarded on status='pending', the
// optimistic-concurrency / double-click guard), the emailVerified flip (the invite
// click IS the email-ownership proof, so no verify-your-email loop right after), and
// the 'invitation.accepted' audit row all co-transact in ONE withTenant tx, so a
// failure anywhere rolls the seat-grant back with its audit row. Direct tx writes
// throughout — never the plugin's own accept endpoint, whose after hooks run
// post-commit and would break the one-transaction audit contract.
//
// Deviation from the per-slice plan, forced by the installed surface: the audit row
// is inserted directly through tx rather than via the shared logAudit helper, because
// logAudit derives its org from the session's active org (requireOrgUser) — but the
// accepting user is not yet a member of any org, so that read resolves to nothing and
// redirects mid-transaction. The invitation row is the authority here, so org + actor
// come from it and the validated session user. setActiveOrganization is therefore the
// one auth.api write and runs AFTER commit: the installed plugin refuses to activate
// an org the caller is not yet a member of, and that membership is visible only once
// the tx commits.
export const acceptInvitation = async (
  _prev: Result<{ ok: true }> | null,
  formData: FormData,
): Promise<Result<{ ok: true }>> => {
  const parsed = acceptInvitationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return err('validation', 'This invitation link is malformed.');
  }
  const { id, token } = parsed.data;

  const currentUser = await getCurrentUser();
  const row = await getInvitationById(id);

  if (
    !row ||
    (await sha256(token)) !== row.tokenHash ||
    row.expiresAt < new Date() ||
    row.status !== 'pending'
  ) {
    return err('not_found', 'This invitation is no longer valid.');
  }

  if (!currentUser || currentUser.email.toLowerCase() !== row.email) {
    return err(
      'forbidden',
      `This invitation was sent to ${row.email}. Sign in with that address to accept it.`,
    );
  }

  const h = await headers();

  await withTenant(row.organizationId, async (tx) => {
    const [newMember] = await tx
      .insert(member)
      .values({
        id: crypto.randomUUID(),
        userId: currentUser.id,
        organizationId: row.organizationId,
        role: row.role ?? 'member',
        createdAt: new Date(),
      })
      .returning({ id: member.id });

    await tx
      .update(invitation)
      .set({ status: 'accepted', acceptedAt: new Date() })
      .where(and(eq(invitation.id, id), eq(invitation.status, 'pending')));

    if (!currentUser.emailVerified) {
      await tx
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.id, currentUser.id));
    }

    await tx.insert(auditLogs).values({
      organizationId: row.organizationId,
      actorUserId: currentUser.id,
      actorIp: h.get('x-forwarded-for'),
      actorUserAgent: h.get('user-agent')?.slice(0, 512),
      action: 'invitation.accepted',
      subjectType: 'invitation',
      subjectId: id,
      payload: { newMemberId: newMember?.id, role: row.role },
    });
  });

  await auth.api.setActiveOrganization({
    headers: h,
    body: { organizationId: row.organizationId },
  });

  redirect('/dashboard' as Route);
};
