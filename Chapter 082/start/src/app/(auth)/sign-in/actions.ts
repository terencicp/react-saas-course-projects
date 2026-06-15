'use server';

import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { mapAuthError } from '@/lib/auth/error-mapping';
import { safeNext } from '@/lib/redirects';
import { err, type Result } from '@/lib/result';

const SignInSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
  next: z.string().optional(),
});

export const signInAction = async (
  _prevState: Result<never> | null,
  formData: FormData,
): Promise<Result<never>> => {
  const parsed = SignInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return err(
      'validation',
      'Check the highlighted fields.',
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  // No authorize seam: the credential check is the authorization.

  const { email, password } = parsed.data;
  try {
    await auth.api.signInEmail({ body: { email, password } });
  } catch (e) {
    return mapAuthError(e);
  }

  const next = safeNext(parsed.data.next);
  redirect((next ?? '/dashboard') as Route);
};
