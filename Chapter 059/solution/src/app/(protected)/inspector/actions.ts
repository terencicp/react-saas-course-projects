'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { ACTING_USER_COOKIE } from '@/app/(protected)/inspector/constants';
import { err, ok, type Result } from '@/lib/result';

import { runSeed } from '../../../../scripts/seed';

// Dev-only: swap the acting user among the seeded set so the inspector can be
// viewed as each role without a real sign-in dance. Gated NODE_ENV — never a
// production identity-spoof primitive.
export const switchUserAction = async (
  _prev: Result<{ userId: string }> | null,
  formData: FormData,
): Promise<Result<{ userId: string }>> => {
  if (process.env.NODE_ENV === 'production') {
    return err('forbidden', 'Identity switching is disabled in production.');
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
  if (process.env.NODE_ENV === 'production') {
    return err('forbidden', 'Reseeding is disabled in production.');
  }

  await runSeed();
  revalidatePath('/inspector');
  return ok({ reseeded: true });
};
