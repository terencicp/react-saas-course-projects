import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { user as users } from '@/db/schema/auth';

// The "delete my account" handler the settings page calls.
//
// SEEDED AUDIT DEFECT #8 (finding 8) — GDPR deletion leaves rows behind (081 L4):
// this deletes ONLY the `users` row. It does not walk the data graph
// (org_members, invitations, audit_logs, invoices, invoice_notes, exports), makes no
// external calls (Stripe / Resend / PostHog / R2), does not anonymize the audit
// trail, and does not route through the async deletion job. PII survives a
// "successful" deletion request — an Article 17 exposure, and the confirmation email
// the user received is a lie. The healthy shape routes through the async Trigger.dev
// account-deletion job (trigger/delete-user.ts) that walks the retention catalog,
// blocks sign-in for the in-progress account, anonymizes (not hard-deletes) the
// audit trail, and fires the external deletes. The target ships the bug on purpose;
// do not "fix" it here; finding 8 names the job and the anonymize reach.
export const deleteAccount = async (userId: string): Promise<void> => {
  // SEEDED #8: one-row delete. Everything else the retention catalog names is left
  // behind.
  await db.delete(users).where(eq(users.id, userId));
};
