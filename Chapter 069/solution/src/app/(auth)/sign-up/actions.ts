'use server';

import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { mapAuthError } from '@/lib/auth/error-mapping';
import { err, type Result } from '@/lib/result';

const SignUpSchema = z.strictObject({
  name: z.string().min(1).max(80),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(12),
});

export const signUpAction = async (
  _prevState: Result<never> | null,
  formData: FormData,
): Promise<Result<never>> => {
  const parsed = SignUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return err(
      'validation',
      'Check the highlighted fields.',
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  // No authorize seam: sign-up is a public endpoint.

  const { name, email, password } = parsed.data;
  try {
    // No taken-email branch: under autoSignIn:false a duplicate returns generic
    // success, so enumeration is closed at the source (Ch053 L1) — a taken email
    // and a fresh one are indistinguishable to the caller.
    await auth.api.signUpEmail({ body: { name, email, password } });
  } catch (e) {
    return mapAuthError(e);
  }

  redirect(`/verify-email?email=${encodeURIComponent(email)}` as Route);
};
