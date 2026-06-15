'use server';

import { revalidatePath } from 'next/cache';
import { SUPPORTED_LOCALES } from '@/lib/i18n/supported';
import { getSession, setActingIdentity } from '@/server/session';
import {
  findInvoice,
  pushAudit,
  reseed,
  setUserLocale,
  setUserTimeZone,
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

// Override the active user's profile locale — the inspector's locale/tz panel
// posts this, then deep-links into `/[locale]/invoices`.
export const setLocaleOverride = async (formData: FormData): Promise<void> => {
  const session = await getSession();
  const raw = String(formData.get('locale') ?? '');
  const locale = SUPPORTED_LOCALES.find((l) => l === raw);
  if (locale) {
    setUserLocale(session.userId, locale);
  }
  revalidatePath('/inspector');
};

// Override the active user's profile timezone so the DST panel re-renders in the
// chosen zone (e.g. Europe/London → BST/GMT split, America/New_York → EDT/EST).
export const setTimeZoneOverride = async (
  formData: FormData,
): Promise<void> => {
  const session = await getSession();
  const timeZone = String(formData.get('timeZone') ?? 'UTC');
  setUserTimeZone(session.userId, timeZone);
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
