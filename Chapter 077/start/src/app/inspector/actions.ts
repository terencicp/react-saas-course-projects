'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { armForceFailure } from '@/lib/comments/force-failure';
import { getSession, setActingIdentity } from '@/server/session';
import {
  findInvoice,
  insertCoworkerComment,
  pushAudit,
  reseed,
} from '@/server/store';

// Reset the store to its deterministic seed. Surfaced by the inspector so a
// run can return to a known state between demos.
export const resetAndReseed = async (): Promise<void> => {
  reseed();
  revalidatePath('/invoices');
  revalidatePath('/inspector');
};

// Switch the acting identity (org + role) via the session cookie.
export const switchIdentity = async (formData: FormData): Promise<void> => {
  const value = String(formData.get('identity') ?? 'org-acme:admin');
  await setActingIdentity(value);
  revalidatePath('/invoices');
  revalidatePath('/inspector');
};

// Force version drift on a target row: bump its `version` directly in the store
// so an open edit form goes stale, demonstrating the optimistic-concurrency 409.
export const forceVersionDrift = async (formData: FormData): Promise<void> => {
  const orgId = String(formData.get('orgId') ?? '');
  const id = String(formData.get('id') ?? '');
  const row = findInvoice(orgId, id);
  if (row) {
    row.version += 1;
    pushAudit({
      orgId,
      actorUserId: 'system',
      action: 'invoice.version-drift',
      subjectId: id,
    });
  }
  revalidatePath('/invoices');
  revalidatePath('/inspector');
};

// Arm the per-user "Force 500 on next POST" one-shot. The next
// `addCommentAction` for the acting user returns an `internal` Result and
// writes no audit row, then the flag auto-clears — the R10 rollback path.
export const armForceFailureAction = async (): Promise<void> => {
  const session = await getSession();
  armForceFailure(session.userId);
  revalidatePath('/inspector');
};

// Insert a comment authored by the *other* seeded user in the org. It does NOT
// call `updateTag` — the client poll is what surfaces it within 10s (R6).
export const insertCoworkerCommentAction = async (
  formData: FormData,
): Promise<void> => {
  const session = await getSession();
  const invoiceId = String(formData.get('invoiceId') ?? '');
  if (invoiceId) {
    insertCoworkerComment(session.orgId, invoiceId);
  }
  revalidatePath('/inspector');
};

// Clear the browser's TanStack cache by redirecting the focal invoice with the
// `?clearCache=1` flag — `<Providers>` reads it once and calls
// `queryClient.clear()`.
export const clearClientCacheAction = async (
  formData: FormData,
): Promise<void> => {
  const invoiceId = String(formData.get('invoiceId') ?? '');
  redirect(`/invoices/${invoiceId}?clearCache=1`);
};
