'use server';

import { revalidatePath } from 'next/cache';
import { toggleFlag } from '@/server/inspector-flags';
import { setActingIdentity } from '@/server/session';
import {
  findInvoice,
  findQuotaRow,
  pushAudit,
  reseed,
  todayUtc,
  usageQuota,
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

// Force the selected user's today row near the cap so the next question crosses
// the 100k ceiling and the 429 refusal is demonstrable.
export const forceQuota = async (formData: FormData): Promise<void> => {
  const userId = String(formData.get('userId') ?? '');
  const day = todayUtc();
  const existing = findQuotaRow(userId, day);
  if (existing) {
    existing.tokensUsed = 99_500;
    existing.updatedAt = new Date().toISOString();
  } else if (userId) {
    usageQuota.push({
      userId,
      day,
      tokensUsed: 99_500,
      updatedAt: new Date().toISOString(),
    });
  }
  revalidatePath('/inspector');
};

// Flip the inspector debug flags. Each makes a failure mode visible by hand:
// FORCE_TOOL_ERROR → the tool's output-error state; BYPASS_AUTHED_ROUTE → the
// 401 the dev session never produces; MODEL_FROM_INPUT_ORGID → the cross-tenant
// leak the closure-bound orgId prevents.
export const toggleForceToolError = async (): Promise<void> => {
  toggleFlag('FORCE_TOOL_ERROR');
  revalidatePath('/inspector');
};

export const toggleBypassAuthedRoute = async (): Promise<void> => {
  toggleFlag('BYPASS_AUTHED_ROUTE');
  revalidatePath('/inspector');
};

export const toggleModelFromInputOrgid = async (): Promise<void> => {
  toggleFlag('MODEL_FROM_INPUT_ORGID');
  revalidatePath('/inspector');
};
