import { createElement } from 'react';
import { z } from 'zod';

import WelcomeVerification from '@/emails/welcome-verification';
import { env } from '@/env';
import { sendEmail } from '@/lib/email';
import { resetEmailLimiter, resetLimiter } from '@/lib/rate-limit';
import { rateLimitedResponse } from '@/lib/rate-limit-headers';
import { safeLimit } from '@/lib/safe-limit';

// The password-reset request endpoint: a user submits their email, and we send the
// reset link via Resend.
//
// Rate-limit coverage (082 finding 6, pre-fixed): the handler is dual-keyed and
// fail-open. Both gates must pass — per-IP (resetLimiter) AND per-email
// (resetEmailLimiter) — each wrapped in safeLimit so a Redis outage logs
// `rate_limit_unavailable` and lets the path stay up rather than 500ing. A reject
// returns a generic 429 with RateLimit-* headers and an opaque body — no leak of
// which gate tripped.
export const POST = async (request: Request): Promise<Response> => {
  const body = await request.json().catch(() => null);
  const parsed = z.object({ email: z.email() }).safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid email.' }, { status: 400 });
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const byIp = await safeLimit(resetLimiter, 'rl:reset', ip);
  const byEmail = await safeLimit(
    resetEmailLimiter,
    'rl:reset:email',
    parsed.data.email,
  );
  if (!byIp.success || !byEmail.success) {
    return rateLimitedResponse(byIp.success ? byEmail : byIp);
  }

  const resetUrl = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=stub`;

  await sendEmail({
    to: parsed.data.email,
    subject: 'Reset your password',
    react: createElement(WelcomeVerification, {
      firstName: 'there',
      verifyUrl: resetUrl,
    }),
    idempotencyKey: `reset:${parsed.data.email}:${Date.now()}`,
  });

  // Opaque success regardless of whether the address exists (enumeration-safe).
  return Response.json({ ok: true });
};
