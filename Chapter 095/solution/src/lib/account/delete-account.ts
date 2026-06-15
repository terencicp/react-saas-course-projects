import 'server-only';

import { deleteUser } from '../../../trigger/delete-user';

// The "delete my account" handler the settings page calls.
//
// GDPR deletion (082 finding 8, pre-fixed): the request routes through the async
// deletion job rather than an inline one-row DELETE. The job (trigger/delete-user.ts)
// owns the actual erasure inside one db.transaction — it walks the retention catalog
// (invitation, invoice_notes, exports, member, the Better-Auth session/account rows),
// anonymizes (does NOT hard-delete) the append-only audit trail, fires the external
// deletes (Stripe / Resend / PostHog / R2), and removes the user row last. The
// handler's job is only to enqueue that job, so the erasure is atomic and complete.
export const deleteAccount = async (userId: string): Promise<void> => {
  // Enqueue the async deletion job; it owns the full graph walk + anonymize step.
  // (A production hardening also marks the account deletion-in-progress here so a
  // mid-deletion sign-in is blocked — named, kept out of this handler's one job.)
  await deleteUser.trigger({ userId });
};
