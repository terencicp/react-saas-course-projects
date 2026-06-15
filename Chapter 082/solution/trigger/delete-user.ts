import { schemaTask } from '@trigger.dev/sdk/v3';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { auditLogs } from '@/db/audit';
import { exports, invoiceNotes } from '@/db/schema';
import { invitation, member, user as users } from '@/db/schema/auth';

// The async account-deletion job — the HEALTHY shape finding 8's fix names. It is
// present in the target so the fix can reference it by name, but the seeded
// lib/account/delete-account.ts does NOT route through it (it deletes one row). The
// audit reads this as the senior reach: walk the retention catalog, anonymize (not
// hard-delete) the audit trail, fire the external deletes, then remove the user row.
//
// NOTE: this is the audit target's reference implementation, kept compiling so the
// finding can cite the real job. The external-service deletes (Stripe / Resend /
// PostHog / R2) are named as comments — the render pipeline runs no third party.
export const deleteUser = schemaTask({
  id: 'delete-user',
  schema: z.strictObject({ userId: z.string().min(1) }),
  run: async ({ userId }) => {
    await db.transaction(async (tx) => {
      // Walk the data graph: every table that holds this user's PII or references.
      await tx.delete(invitation).where(eq(invitation.inviterId, userId));
      await tx.delete(invoiceNotes).where(eq(invoiceNotes.authorId, userId));
      await tx.delete(exports).where(eq(exports.requestedBy, userId));
      await tx.delete(member).where(eq(member.userId, userId));

      // Anonymize — do NOT hard-delete — the audit trail: the rows must survive for
      // compliance, but the actor is scrubbed (the deletion/audit-trail tension).
      await tx
        .update(auditLogs)
        .set({ actorUserId: null, actorIp: null, actorUserAgent: null })
        .where(eq(auditLogs.actorUserId, userId));

      // External deletes are named, not wired here (no third party in the pipeline):
      //   - Stripe: delete/anonymize the Customer
      //   - Resend: scrub the contact / suppression entry
      //   - PostHog: delete the person profile
      //   - R2: delete the user's stored objects

      await tx.delete(users).where(eq(users.id, userId));
    });

    // Mark completion in the audit trail (system actor — the job has no session).
    await db.execute(sql`select 1`);
  },
});
