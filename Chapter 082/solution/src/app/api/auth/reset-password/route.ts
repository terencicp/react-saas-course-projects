import { createElement } from 'react';
import { z } from 'zod';

import WelcomeVerification from '@/emails/welcome-verification';
import { env } from '@/env';
import { sendEmail } from '@/lib/email';

// The password-reset request endpoint: a user submits their email, and we send the
// reset link via Resend.
//
// SEEDED AUDIT DEFECT #6 (finding 6) — missing rate limit on password-reset
// (081 L2): this handler triggers a Resend send on EVERY call with NO rate-limit
// gate. lib/rate-limit.ts declares a `resetLimiter` (per-IP, 3 per 15m) that nothing
// imports here. Two of the three mandatory-limiter triggers apply: it costs money
// via Resend AND it attacks a third party via the target's inbox (account
// enumeration + inbox-bomb). The healthy shape wraps the handler in a per-IP AND
// per-email fail-open limiter and returns a generic 429. The target ships the bug on
// purpose; do not "fix" it here. (No limiter import here — the absence IS the defect;
// finding 6 names the fail-open wrapper and the coverage matrix.)
export const POST = async (request: Request): Promise<Response> => {
  const body = await request.json().catch(() => null);
  const parsed = z.object({ email: z.email() }).safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid email.' }, { status: 400 });
  }

  const resetUrl = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=stub`;

  // SEEDED #6: fires the Resend send with no rate-limit gate in front of it. The
  // declared reset limiter in lib/rate-limit.ts is never reached from this route.
  await sendEmail({
    to: parsed.data.email,
    subject: 'Reset your password',
    react: createElement(WelcomeVerification, {
      firstName: 'there',
      verifyUrl: resetUrl,
    }),
    idempotencyKey: `reset:${parsed.data.email}:${Date.now()}`,
  });

  // Opaque success regardless of whether the address exists (enumeration-safe on the
  // response, but unthrottled — the defect is the missing gate, not the message).
  return Response.json({ ok: true });
};
