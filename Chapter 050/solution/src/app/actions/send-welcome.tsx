'use server';

import { z } from 'zod';

import WelcomeEmail from '@/emails/welcome';
import { env } from '@/env';
import { getActiveContext } from '@/lib/auth-stub';
import { sendEmail } from '@/lib/email';
import { err, type Result } from '@/lib/result';

const schema = z.strictObject({
  recipientEmail: z.email(),
  firstName: z.string().min(1).max(80),
});

export const sendWelcomeEmail = async (
  _prevState: Result<{ id: string }> | null,
  formData: FormData,
): Promise<Result<{ id: string }>> => {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return err(
      'validation',
      'Check the highlighted fields.',
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  const { userId } = await getActiveContext();

  const normalizedRecipient = parsed.data.recipientEmail.trim().toLowerCase();
  const idempotencyKey = `welcome:${userId}:${normalizedRecipient}`;

  // TODO(Unit 8) — replace placeholder with a real Better Auth verification token.
  const verifyUrl = `${env.NEXT_PUBLIC_APP_URL}/verify/placeholder-${idempotencyKey}`;

  return await sendEmail({
    to: parsed.data.recipientEmail,
    subject: `Welcome to ${env.NEXT_PUBLIC_APP_NAME}`,
    react: (
      <WelcomeEmail firstName={parsed.data.firstName} verifyUrl={verifyUrl} />
    ),
    idempotencyKey,
  });
};
