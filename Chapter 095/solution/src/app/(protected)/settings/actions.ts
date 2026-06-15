'use server';

import { createElement } from 'react';

import WelcomeVerification from '@/emails/welcome-verification';
import { sendEmail } from '@/lib/email';
import type { Result } from '@/lib/result';

// The resend-test Server Action (082 finding 5, pre-fixed). The Resend key stays on
// the server: this action calls sendEmail from src/lib/email.ts (the server-only
// boundary that constructs `new Resend(env.RESEND_API_KEY)`), so the key never
// crosses to the browser. The client component calls this instead of fetching the
// Resend API directly.
export const sendResendTest = async (): Promise<Result<{ id: string }>> =>
  sendEmail({
    to: 'test@example.com',
    subject: 'Resend server-action test',
    react: createElement(WelcomeVerification, {
      firstName: 'there',
      verifyUrl: 'https://example.com/verify',
    }),
    idempotencyKey: 'resend-test',
  });
