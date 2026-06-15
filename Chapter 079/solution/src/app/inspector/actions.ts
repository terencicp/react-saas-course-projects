'use server';

import { revalidatePath } from 'next/cache';
import { type DebugFlag, setDebugFlag } from '@/lib/debug-flags';
import { armForceFailure } from '@/lib/force-failure';
import { setActingIdentity } from '@/server/session';
import { reseed } from '@/server/store';

// Switch the acting identity (org + role) via the session cookie. The inspector
// surfaces every seeded `<orgId>:<role>` so a run can act as a different
// org/role — both the user switcher and the org switcher post this.
export const switchIdentity = async (formData: FormData): Promise<void> => {
  const value = String(formData.get('identity') ?? 'org-acme:admin');
  await setActingIdentity(value);
  revalidatePath('/customers');
  revalidatePath('/inspector');
};

// Reset the store to its deterministic seed.
export const resetAndReseed = async (): Promise<void> => {
  reseed();
  revalidatePath('/customers');
  revalidatePath('/inspector');
};

// Arm the userId-keyed force-failure flag: the acting user's NEXT
// `createCustomer` returns an `internal` error (after a short delay) and writes
// no audit row, then the flag auto-clears.
export const armForceFailureForActor = async (
  formData: FormData,
): Promise<void> => {
  const userId = String(formData.get('userId') ?? '');
  if (userId) {
    armForceFailure(userId);
  }
  revalidatePath('/inspector');
};

// Toggle one of the two canonical-bug debug flags.
export const toggleDebugFlag = async (formData: FormData): Promise<void> => {
  const flag = String(formData.get('flag') ?? '') as DebugFlag;
  const on = String(formData.get('on') ?? '') === '1';
  await setDebugFlag(flag, on);
  revalidatePath('/customers/new/step-1');
  revalidatePath('/inspector');
};
