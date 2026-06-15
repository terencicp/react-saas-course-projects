'use server';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { logAudit } from '@/db/audit-log';
import { organization } from '@/db/schema/auth';
import { withTenant } from '@/db/tenant';
import { authedAction } from '@/lib/auth/authed-action';
import { requireRole } from '@/lib/auth/require-role';
import { ok, type Result } from '@/lib/result';

// The admin-surface "transfer ownership" Server Action.
//
// SEEDED AUDIT DEFECT #1 (finding 1) — fail-closed violation (080 L1):
// `requireRole('owner')` is wrapped in a try/catch that LOGS and FALLS THROUGH on a
// thrown check instead of letting it propagate. When requireRole throws (e.g. a
// Postgres blip while reading the membership row, OR a genuine below-owner actor),
// the catch swallows the throw and the mutation proceeds — an owner-only action
// slips through. The healthy shape removes the try/catch and lets the throw reach
// authedAction's outer catch, which converts it to { ok: false, error: { code:
// 'unauthorized' } }. The target ships the bug on purpose; do not "fix" it here.
export const transferOwnershipAction = authedAction(
  'admin',
  z.strictObject({ nextOwnerId: z.string().min(1) }),
  async ({ nextOwnerId }, ctx): Promise<Result<{ ok: true }>> => {
    // SEEDED #1: fail-open try/catch around requireRole('owner').
    try {
      await requireRole('owner');
    } catch (error) {
      // Fail-OPEN: log it and continue. This is the anti-pattern — a thrown access
      // check is a refusal, never a "we logged it then proceeded".
      console.warn('[transfer-ownership] role check failed, continuing', error);
    }

    await withTenant(ctx.orgId, async (tx) => {
      await tx
        .update(organization)
        .set({ ownerId: nextOwnerId })
        .where(eq(organization.id, ctx.orgId));

      await logAudit(tx, {
        organizationId: ctx.orgId,
        actorUserId: ctx.user.id,
        action: 'org.ownership-transferred',
        subjectType: 'organization',
        subjectId: ctx.orgId,
        payload: { nextOwnerId },
      });
    });

    return ok({ ok: true });
  },
);

// A direct (non-action) variant the admin console calls server-side. Same fail-open
// shape so the grep `try { … requireRole('owner')` surfaces the defect regardless of
// entry point.
export const transferOwnership = async (
  orgId: string,
  nextOwnerId: string,
): Promise<void> => {
  try {
    await requireRole('owner');
  } catch (error) {
    console.warn('[transfer-ownership] role check failed, continuing', error);
  }

  await db
    .update(organization)
    .set({ ownerId: nextOwnerId })
    .where(eq(organization.id, orgId));
};
