'use server';

import { headers } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { mapAuthError } from '@/lib/auth/error-mapping';
import { getClientIp } from '@/lib/keys';
import { signInLimiter } from '@/lib/rate-limit';
import {
  type RateLimitBudget,
  rateLimitBudget,
  rateLimited,
} from '@/lib/rate-limit-headers';
import { safeNext } from '@/lib/redirects';
import { err, ok, type Result } from '@/lib/result';
import { safeLimit } from '@/lib/safe-limit';

const SignInSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
  next: z.string().optional(),
});

// Gate before work, dual-keyed: per-IP then per-email (cheaper first), both
// through `safeLimit`, both before `auth.api.signInEmail`. The budget rides the
// success `Result` (no HTTP headers — headers() is read-only here); the reject
// path returns the opaque `rateLimited(...)`. `pending` analytics flush via
// `after()`, never awaited on the path.
export const signInAction = async (
  _state: Result<{ redirectTo: string; rateLimit: RateLimitBudget }> | null,
  formData: FormData,
): Promise<Result<{ redirectTo: string; rateLimit: RateLimitBudget }>> => {
  const parsed = SignInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return err(
      'validation',
      'Check the highlighted fields.',
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  const ip = getClientIp(await headers());
  const email = parsed.data.email;

  const ipLimit = await safeLimit(signInLimiter, 'rl:signin', `ip:${ip}`);
  if (!ipLimit.success) {
    return rateLimited(ipLimit, 'ip', ip);
  }

  const emailLimit = await safeLimit(
    signInLimiter,
    'rl:signin',
    `email:${email}`,
  );
  if (!emailLimit.success) {
    return rateLimited(emailLimit, 'email', email);
  }

  try {
    await auth.api.signInEmail({
      body: { email, password: parsed.data.password },
    });
  } catch (e) {
    after(ipLimit.pending);
    after(emailLimit.pending);
    return mapAuthError(e);
  }

  after(ipLimit.pending);
  after(emailLimit.pending);
  const next = safeNext(parsed.data.next);
  return ok({
    redirectTo: next ?? '/dashboard',
    rateLimit: rateLimitBudget(ipLimit),
  });
};
