'use server';

import { headers } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { mapAuthError } from '@/lib/auth/error-mapping';
import { getClientIp } from '@/lib/keys';
import { resetLimiter } from '@/lib/rate-limit';
import { rateLimited } from '@/lib/rate-limit-headers';
import { err, ok, type Result } from '@/lib/result';
import { safeLimit } from '@/lib/safe-limit';

const ResetSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

// Gate before work, dual-keyed: per-IP then per-email (cheaper first), both
// through `safeLimit`, both before `auth.api.requestPasswordReset`. The per-email gate
// is the load-bearing one here — it survives an IP switch, so a campaign against
// one victim's address can't flood their inbox (and our Resend cost) by rotating
// hosts. Tightest budget in the project (3/15m). Reset has no redirect: the form
// renders an enumeration-uniform confirmation in place, so the ok payload is a
// marker, not a navigation. `pending` analytics flush via `after()`, never awaited
// on the path.
export const resetAction = async (
  _state: Result<{ sent: true }> | null,
  formData: FormData,
): Promise<Result<{ sent: true }>> => {
  const parsed = ResetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return err(
      'validation',
      'Check the highlighted fields.',
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  const ip = getClientIp(await headers());
  const email = parsed.data.email;

  const ipLimit = await safeLimit(resetLimiter, 'rl:reset', `ip:${ip}`);
  if (!ipLimit.success) {
    return rateLimited(ipLimit, 'ip', ip);
  }

  const emailLimit = await safeLimit(
    resetLimiter,
    'rl:reset',
    `email:${email}`,
  );
  if (!emailLimit.success) {
    return rateLimited(emailLimit, 'email', email);
  }

  try {
    // Enumeration-uniform by default: an unknown email returns success without
    // sending. `redirectTo` is only the link target baked into the email; the
    // token-consume page is named-not-built — the project verifies the gate.
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: '/sign-in' },
    });
  } catch (e) {
    after(ipLimit.pending);
    after(emailLimit.pending);
    return mapAuthError(e);
  }

  after(ipLimit.pending);
  after(emailLimit.pending);
  return ok({ sent: true });
};
