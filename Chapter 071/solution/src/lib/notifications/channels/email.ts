import 'server-only';

import { createElement } from 'react';

import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

import { NotificationError } from '../errors';
import { getUserEmail } from '../get-user-email';
import { notifiableEvents } from '../registry';
import type { ChannelFn, NotifiableEvent } from '../types';

// The email channel: resolve the recipient's address, render the registry template with
// the props frozen at dispatch, and send through the wrapper with a deterministic
// idempotency key. No from/replyTo (the wrapper owns them from env) and no unsubscribe
// headers (transactional notifications carry none; opt-out is the per-category toggle).
// A null address is a RECIPIENT_NOT_FOUND the dispatcher's per-channel try/catch swallows;
// a sendEmail error is logged and thrown so the channel independence still holds.
export const sendEmailChannel: ChannelFn = async ({
  recipient,
  event,
  rendered,
}) => {
  const to = await getUserEmail(recipient.userId);
  if (!to) {
    throw new NotificationError('RECIPIENT_NOT_FOUND', recipient.userId);
  }

  // Read the template through the NotifiableEvent field type — passing the raw `as const`
  // union straight to createElement does not typecheck (the per-entry prop types don't
  // unify, TS2769); the permissive `(props: any) => ReactElement` field accepts every one.
  const eventDef: NotifiableEvent = notifiableEvents[event.type];
  const react = createElement(eventDef.templates.email, rendered.emailProps);

  const sent = await sendEmail({
    to,
    subject: rendered.inbox.title,
    react,
    idempotencyKey: `${event.type}:${event.subjectId}:${recipient.userId}`,
  });

  if (!sent.ok) {
    logger.error(
      {
        seam: 'notifications.channel',
        channel: 'email',
        code: sent.error.code,
      },
      'email send failed',
    );
    throw new Error(sent.error.userMessage);
  }
};
