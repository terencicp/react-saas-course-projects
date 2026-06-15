'use server';

import { revalidatePath } from 'next/cache';
import { setActingIdentity } from '@/server/session';
import { findInvoice, pushAudit, reseed } from '@/server/store';

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
