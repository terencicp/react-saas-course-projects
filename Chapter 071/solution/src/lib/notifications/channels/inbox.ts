import 'server-only';

import { db } from '@/db';
import { notifications } from '@/db/schema';

import type { ChannelFn } from '../types';

// The in-app inbox channel: insert one notifications row from the content rendered once at
// dispatch (rendered.inbox.title/body, frozen onto the row), so the inbox UI is a pure read
// with no joins, immune to later actor-name drift. This is the ONLY writer of the
// notifications table; any direct write outside lib/notifications/ is a regression.
export const writeInboxChannel: ChannelFn = async ({
  recipient,
  event,
  payload,
  rendered,
}) => {
  await db.insert(notifications).values({
    userId: recipient.userId,
    orgId: rendered.orgId,
    eventType: event.type,
    subjectId: event.subjectId,
    title: rendered.inbox.title,
    body: rendered.inbox.body,
    payload,
  });
};
