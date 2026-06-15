'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { createElement } from 'react';
import { z } from 'zod';

import { db } from '@/db';
import { logAudit } from '@/db/audit-log';
import { invitation, member, organization, user } from '@/db/schema/auth';
import { withTenant } from '@/db/tenant';
import InviteEmail from '@/emails/invite';
import { INVITATION_TTL_SECONDS } from '@/lib/auth';
import { authedAction } from '@/lib/auth/authed-action';
import { sendEmail } from '@/lib/email';
import {
  generateInviteToken,
  sha256,
  signedInviteUrl,
} from '@/lib/invitations/url';
import { err, isUniqueViolation, ok } from '@/lib/result';

// Module-local, NOT exported: a "use server" module may export only async
// functions — Next 16.2.7 rejects a non-function export (the Zod schema is an
// object) at runtime. .toLowerCase() matches the partial-unique lower(email) index;
// owner is not invitable (the transfer flow, not built).
const sendInvitationSchema = z.strictObject({
  email: z.email().toLowerCase(),
  role: z.enum(['admin', 'member']),
});

// Sends an invitation as a capability. The row write and its 'invitation.sent'
// audit row co-transact in one withTenant; the email send sits OUTSIDE that
// transaction (send-after-commit) so a Resend outage leaves the row plus a resend
// affordance, not an orphan email on a rollback. The insert is hand-rolled through
// tx — never the plugin's invite API, whose after hooks run post-commit and would
// break the one-transaction audit contract. The raw token never reaches the DB or
// logs: only its sha256 is stored. A duplicate-pending insert raises 23505, which
// isUniqueViolation maps to a conflict (not an invented Result code).
export const sendInvitation = authedAction(
  'admin',
  sendInvitationSchema,
  async ({ email, role }, ctx) => {
    const existingUser = await db.query.user.findFirst({
      where: eq(user.email, email),
    });
    if (existingUser) {
      const existingMember = await ctx.db.query.member.findFirst({
        where: eq(member.userId, existingUser.id),
      });
      if (existingMember) {
        return err(
          'conflict',
          `${existingUser.name} is already a member of this organization.`,
        );
      }
    }

    const rawToken = generateInviteToken();
    const tokenHash = await sha256(rawToken);

    let invitationId: string;
    try {
      invitationId = await withTenant(ctx.orgId, async (tx) => {
        const [row] = await tx
          .insert(invitation)
          .values({
            id: crypto.randomUUID(),
            organizationId: ctx.orgId,
            email,
            role,
            inviterId: ctx.user.id,
            status: 'pending',
            tokenHash,
            expiresAt: new Date(Date.now() + INVITATION_TTL_SECONDS * 1000),
          })
          .returning({ id: invitation.id });
        if (!row) {
          throw new Error('invitation insert returned no row');
        }

        await logAudit(tx, {
          action: 'invitation.sent',
          subjectType: 'invitation',
          subjectId: row.id,
          payload: { email, role },
        });

        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return err('conflict', 'This address already has a pending invite.');
      }
      throw e;
    }

    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.orgId),
    });
    const orgName = org?.name ?? 'your organization';
    const acceptUrl = await signedInviteUrl(invitationId, rawToken);

    const sent = await sendEmail({
      to: email,
      subject: `You're invited to ${orgName}`,
      react: createElement(InviteEmail, {
        orgName,
        inviterName: ctx.user.name,
        role,
        acceptUrl,
        expiresAt: new Date(Date.now() + INVITATION_TTL_SECONDS * 1000),
      }),
      idempotencyKey: `invite:${invitationId}`,
    });

    revalidatePath('/inspector');
    return ok({ invitationId, emailSent: sent.ok });
  },
);
