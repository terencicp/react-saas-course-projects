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

// The inspector's email mock (the chapter-outline MOCK_EMAIL_SENT_COUNT proxy). When
// EMAIL_MOCK='1' (the default), sendEmail short-circuits before Resend: it bumps an
// in-process counter, logs the rendered subject/recipient, and returns ok — so the
// notification inspector's email-sent counter is deterministic with no live round-trip.
// The counter + fail flag are per-process; the dev server is single-process, which is
// sufficient for the inspector loop. The student never edits this file.
let emailSentCount = 0;
let emailShouldFail = false;

export const getEmailSentCount = (): number => emailSentCount;

export const resetEmailSentCount = (): void => {
  emailSentCount = 0;
};

// The `Make email fail` debug's hook: when set, the mock returns an error instead of
// bumping the counter, so the inspector can prove channel independence (the inbox
// channel still writes its row while the email channel fails and is swallowed).
export const setEmailShouldFail = (b: boolean): void => {
  emailShouldFail = b;
};

export const sendEmail = async (
  input: SendInput,
): Promise<Result<{ id: string }>> => {
  const normalizedTo = input.to.trim().toLowerCase();

  // Mock path: short-circuit before Resend, the suppression list, and any IO.
  if (env.EMAIL_MOCK === '1') {
    if (emailShouldFail) {
      console.info('[email:mock] forced failure', { to: normalizedTo });
      return err('internal', 'forced email failure');
    }
    emailSentCount += 1;
    console.info('[email:mock] sent', {
      to: normalizedTo,
      subject: input.subject,
      count: emailSentCount,
    });
    return ok({ id: `mock_${crypto.randomUUID()}` });
  }

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
