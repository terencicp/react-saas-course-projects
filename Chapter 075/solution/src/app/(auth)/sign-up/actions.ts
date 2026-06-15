'use server';

import { headers } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { mapAuthError } from '@/lib/auth/error-mapping';
import { getClientIp } from '@/lib/keys';
import { signUpLimiter } from '@/lib/rate-limit';
import {
  type RateLimitBudget,
  rateLimitBudget,
  rateLimited,
} from '@/lib/rate-limit-headers';
import { err, ok, type Result } from '@/lib/result';
import { safeLimit } from '@/lib/safe-limit';

const SignUpSchema = z.strictObject({
  name: z.string().min(1).max(80),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(12),
});

// Gate before work, per-IP only: one limiter check on `ip:` before
// `auth.api.signUpEmail`. Keying on the email is wrong here — the address is the
// attacker's choice, so a per-email gate lets one host cycle fresh addresses past
// it. The budget rides the success `Result` (no HTTP headers — headers() is
// read-only here); the reject path returns the opaque `rateLimited(...)`.
// `pending` analytics flush via `after()`, never awaited on the path.
export const signUpAction = async (
  _state: Result<{ redirectTo: string; rateLimit: RateLimitBudget }> | null,
  formData: FormData,
): Promise<Result<{ redirectTo: string; rateLimit: RateLimitBudget }>> => {
  const parsed = SignUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return err(
      'validation',
      'Check the highlighted fields.',
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  const ip = getClientIp(await headers());

  const ipLimit = await safeLimit(signUpLimiter, 'rl:signup', `ip:${ip}`);
  if (!ipLimit.success) {
    return rateLimited(ipLimit, 'ip', ip);
  }

  const { name, email, password } = parsed.data;
  try {
    // No taken-email branch: under autoSignIn:false a duplicate returns generic
    // success, so enumeration is closed at the source (Ch053 L1).
    await auth.api.signUpEmail({ body: { name, email, password } });
  } catch (e) {
    after(ipLimit.pending);
    return mapAuthError(e);
  }

  after(ipLimit.pending);
  return ok({
    redirectTo: `/verify-email?email=${encodeURIComponent(email)}`,
    rateLimit: rateLimitBudget(ipLimit),
  });
};
