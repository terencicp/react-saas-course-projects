import 'server-only';

import { logger } from '@/lib/logger';

import { sendEmailChannel } from './channels/email';
import { writeInboxChannel } from './channels/inbox';
import { isDuplicate, recordDedup } from './dedup';
import { NotificationError } from './errors';
import { readPrefsForCategory, resolveChannels } from './prefs';
import { notifiableEvents } from './registry';
import type {
  ChannelFn,
  ChannelName,
  DispatchResult,
  NotificationEvent,
  RenderedContent,
} from './types';

// The uniform channel table: the dispatcher loops `await channelFns[channel](args)` with no
// branch on channel name. Adding a channel later is one entry of the same signature.
const channelFns = {
  email: sendEmailChannel,
  inbox: writeInboxChannel,
} satisfies Record<ChannelName, ChannelFn>;

// The one seam: every call site builds a NotificationEvent and `await dispatch(...)`, never
// importing a channel or writing the notifications table directly. Body order: registry
// lookup (a miss is a programmer error — thrown before the loop, never swallowed); one
// batched prefs read; then a per-recipient loop that resolves channels (default-on +
// critical override), counts suppressions, skips a fully-suppressed recipient, runs the
// dedup check, fans out behind a per-channel try/catch (so one failing channel never kills
// the other), and records the dedup row last. The return is a flat count summary,
// deliberately NOT a Result<T> and NOT per-channel.
export const dispatch = async (
  event: NotificationEvent,
): Promise<DispatchResult> => {
  const eventDef = notifiableEvents[event.type];
  if (!eventDef) {
    throw new NotificationError('REGISTRY_MISS', event.type);
  }

  const result: DispatchResult = { sent: 0, deduped: 0, suppressedByPrefs: 0 };

  // One batched read across all recipients (never per-recipient).
  const prefsByUser = await readPrefsForCategory(
    event.recipientUserIds,
    eventDef.preferenceCategory,
  );

  // Rendered once per dispatch and frozen onto every recipient's inbox row / passed to the
  // email template — render-at-dispatch keeps the inbox UI a pure read, immune to drift.
  const rendered: RenderedContent = {
    emailProps: event.payload,
    inbox: eventDef.templates.inbox(event.payload),
    orgId: null,
  };

  for (const userId of event.recipientUserIds) {
    const channels = resolveChannels(eventDef, prefsByUser.get(userId));
    result.suppressedByPrefs += eventDef.channels.length - channels.length;
    if (channels.length === 0) {
      continue;
    }

    const duplicate = await isDuplicate({
      event,
      userId,
      payload: event.payload,
    });
    if (duplicate) {
      result.deduped++;
      continue;
    }

    for (const channel of channels) {
      try {
        await channelFns[channel]({
          recipient: { userId },
          event,
          payload: event.payload,
          rendered,
        });
        result.sent++;
      } catch (e) {
        logger.error(
          { seam: 'notifications.channel', channel, err: e },
          'channel failed',
        );
      }
    }

    await recordDedup({ event, userId, payload: event.payload });
  }

  logger.info(
    { seam: 'notifications.dispatch', ...result },
    'dispatch settled',
  );
  return result;
};
