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

// The admin-surface "transfer ownership" Server Action. Fail-closed (082 finding 1,
// pre-fixed): `requireRole('owner')` runs with no surrounding try/catch — a thrown
// check is a refusal that reaches authedAction's outer catch, which converts it to
// { ok: false, error: { code: 'unauthorized' } }. The call site holds no
// error-handling machinery; the wrapper owns the conversion.
export const transferOwnershipAction = authedAction(
  'admin',
  z.strictObject({ nextOwnerId: z.string().min(1) }),
  async ({ nextOwnerId }, ctx): Promise<Result<{ ok: true }>> => {
    // The whole gate. No try, no catch, no fall-through: when requireRole throws,
    // nothing downstream runs.
    await requireRole('owner');

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

// The direct (non-action) variant the admin console calls server-side. Same
// fail-closed shape: requireRole('owner') throws on a below-owner actor and the
// throw propagates to the caller — no swallowing catch.
export const transferOwnership = async (
  orgId: string,
  nextOwnerId: string,
): Promise<void> => {
  await requireRole('owner');

  await db
    .update(organization)
    .set({ ownerId: nextOwnerId })
    .where(eq(organization.id, orgId));
};
