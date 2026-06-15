'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { logAudit } from '@/db/audit-log';
import { member } from '@/db/schema/auth';
import { withTenant } from '@/db/tenant';
import { authedAction } from '@/lib/auth/authed-action';
import { err, ok } from '@/lib/result';

// Module-local, NOT exported: a "use server" module may export only async
// functions — Next 16.2.7's ensureServerEntryExports rejects a non-function export
// (the Zod schema is an object) at runtime, 500-ing the action. Nothing imports the
// schema externally, so the action's input shape is the contract.
const changeMemberRoleSchema = z.strictObject({
  memberId: z.string().min(1),
  newRole: z.enum(['admin', 'member']),
});

// The only role-management action this project ships (no remove/leave/transfer).
// 'owner' is not a settable value — promotion to owner is the transfer flow, not
// built. Owner targets are refused, the last owner doubly so. The role change and its
// audit row co-transact in one withTenant: if the audit insert fails the whole tx
// rolls back — a role changed with no audit row is the wrong direction for a
// compliance table. The write goes through tx directly, never the plugin API (whose
// after hooks run post-commit, breaking the one-transaction audit contract).
export const changeMemberRole = authedAction(
  'admin',
  changeMemberRoleSchema,
  async ({ memberId, newRole }, ctx) => {
    const target = await ctx.db.query.member.findFirst({
      where: eq(member.id, memberId),
    });
    if (!target) {
      return err('not_found', 'That member is no longer in this organization.');
    }

    if (target.role === 'owner') {
      const owners = await ctx.db.query.member.findMany({
        where: eq(member.role, 'owner'),
      });
      if (owners.length <= 1) {
        return err('conflict', 'You cannot change the role of the last owner.');
      }
      return err(
        'conflict',
        "An owner's role is changed through ownership transfer, not here.",
      );
    }

    await withTenant(ctx.orgId, async (tx) => {
      await tx
        .update(member)
        .set({ role: newRole })
        .where(
          and(eq(member.id, memberId), eq(member.organizationId, ctx.orgId)),
        );
      await logAudit(tx, {
        action: 'member.role-changed',
        subjectType: 'member',
        subjectId: memberId,
        payload: { before: target.role, after: newRole },
      });
    });

    revalidatePath('/inspector');
    return ok({ memberId, role: newRole });
  },
);
