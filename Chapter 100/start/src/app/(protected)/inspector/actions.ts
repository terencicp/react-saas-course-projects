'use server';

import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { ACTING_USER_COOKIE } from '@/app/(protected)/inspector/constants';
import { dbUnpooled } from '@/db';
import { err, ok, type Result } from '@/lib/result';

import { runSeed } from '../../../../scripts/seed';

const devOnly = (): Result<never> | null =>
  process.env.NODE_ENV === 'production'
    ? err('forbidden', 'This control is disabled in production.')
    : null;

// Dev-only: swap the acting user among the seeded set so the inspector can be
// viewed as each role without a real sign-in dance. Gated NODE_ENV.
export const switchUserAction = async (
  _prev: Result<{ userId: string }> | null,
  formData: FormData,
): Promise<Result<{ userId: string }>> => {
  const gate = devOnly();
  if (gate) {
    return gate;
  }

  const userId = String(formData.get('userId') ?? '');
  if (!userId) {
    return err('validation', 'Pick a seeded user to act as.');
  }

  const jar = await cookies();
  jar.set(ACTING_USER_COOKIE, userId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });

  revalidatePath('/inspector');
  return ok({ userId });
};

// Dev-only: re-run the deterministic seed so the inspector can be reset between
// experiments. Gated NODE_ENV.
export const resetAndReseedAction = async (): Promise<
  Result<{ reseeded: true }>
> => {
  const gate = devOnly();
  if (gate) {
    return gate;
  }

  await runSeed();
  revalidatePath('/inspector');
  revalidatePath('/invoices');
  return ok({ reseeded: true });
};

// Dev-only: bump a target invoice's `version` directly (raw SQL, schema-agnostic)
// so an open edit form goes stale — drives the optimistic-concurrency 409 path.
export const switchOrgAction = async (
  _prev: Result<{ orgId: string }> | null,
  formData: FormData,
): Promise<Result<{ orgId: string }>> => {
  const gate = devOnly();
  if (gate) {
    return gate;
  }

  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) {
    return err('validation', 'Pick an org.');
  }

  // The org switch is driven client-side via the Better Auth client plugin; this
  // action exists for parity and revalidates the inspector after the swap.
  revalidatePath('/inspector');
  return ok({ orgId });
};

export const forceVersionDrift = async (
  _prev: Result<{ id: string }> | null,
  formData: FormData,
): Promise<Result<{ id: string }>> => {
  const gate = devOnly();
  if (gate) {
    return gate;
  }

  const id = String(formData.get('id') ?? '');
  if (!id) {
    return err('validation', 'Pick an invoice to drift.');
  }

  await dbUnpooled.execute(
    sql`update invoices set version = version + 1 where id = ${id}::uuid`,
  );

  revalidatePath('/inspector');
  revalidatePath('/invoices');
  return ok({ id });
};

// Dev-only: throw so the launch-checklist Sentry row has an in-app trigger. Its
// delivery to Sentry is by-hand; locally it just surfaces a thrown error caught at
// the action boundary and reported in the test-error region.
export const triggerTestError = async (
  _prev: Result<{ thrown: true }> | null,
): Promise<Result<{ thrown: true }>> => {
  const gate = devOnly();
  if (gate) {
    return gate;
  }

  throw new Error('Inspector test error — this is the Sentry wiring probe.');
};
