import 'server-only';

import type { ReactNode } from 'react';
import { Resend } from 'resend';

import { env } from '@/env';
import { err, ok, type Result } from '@/lib/result';
import { isSuppressed } from '@/lib/suppressions';

// The single side-effect boundary every email flows through (Principle #3): a
// thin convenience layer over Resend that reads the suppression list at the edge,
// defaults from/replyTo from validated env, and returns a `Result` — never an
// abstraction, never a per-call `from`, never a throw on an expected failure.
const resend = new Resend(env.RESEND_API_KEY);

export type SendInput = {
  to: string;
  subject: string;
  react: ReactNode;
  idempotencyKey: string;
  replyTo?: string;
  bypassSuppression?: boolean;
};

export const sendEmail = async (
  input: SendInput,
): Promise<Result<{ id: string }>> => {
  const normalizedTo = input.to.trim().toLowerCase();

  let suppression: Awaited<ReturnType<typeof isSuppressed>>;
  try {
    suppression = await isSuppressed(normalizedTo, { kind: 'transactional' });
  } catch {
    return err('internal', 'Could not send email.');
  }

  if (suppression.suppressed && !input.bypassSuppression) {
    console.info('[email] suppressed', { to: normalizedTo });
    return err('forbidden', 'This recipient is on the suppression list.');
  }

  const { data, error } = await resend.emails.send(
    {
      from: env.EMAIL_FROM,
      to: [normalizedTo],
      replyTo: input.replyTo ?? env.EMAIL_REPLY_TO,
      subject: input.subject,
      react: input.react,
    },
    { idempotencyKey: input.idempotencyKey },
  );

  if (error || !data) {
    console.error('[email] failed', { to: normalizedTo, error });
    return err('internal', 'Email send failed.');
  }

  console.info('[email] sent', {
    id: data.id,
    to: normalizedTo,
    subject: input.subject,
  });
  return ok({ id: data.id });
};
