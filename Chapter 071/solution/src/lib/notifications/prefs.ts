import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { userNotificationPreferences } from '@/db/schema';

import type { ChannelName, NotifiableEvent } from './types';

// Preferences read once per dispatch, batched, default-on. The dispatcher calls
// readPrefsForCategory ONCE before the per-recipient loop (never per-recipient), then
// resolveChannels per recipient against that user's row. A missing row is `undefined`,
// which `?? true` reads as on — silence-by-default is worse than friction. The
// criticalChannel override forces a channel (billing email) back on even when toggled off.

export type NotificationPrefRow =
  typeof userNotificationPreferences.$inferSelect;

// One batched `WHERE userId IN (...) AND category = ?` query, then a per-recipient Map
// lookup. Users with no row map to undefined so default-on holds at resolveChannels.
export const readPrefsForCategory = async (
  userIds: string[],
  category: string,
): Promise<Map<string, NotificationPrefRow | undefined>> => {
  const map = new Map<string, NotificationPrefRow | undefined>();
  if (userIds.length === 0) {
    return map;
  }

  const rows = await db
    .select()
    .from(userNotificationPreferences)
    .where(
      and(
        inArray(userNotificationPreferences.userId, userIds),
        eq(userNotificationPreferences.category, category),
      ),
    );

  for (const row of rows) {
    map.set(row.userId, row);
  }
  return map;
};

// Pure synchronous channel resolution: keep a channel when the user opted in (or has no
// row → `?? true` default-on) OR when it is the event's critical channel (the override
// that keeps billing email flowing). The two clauses are the load-bearing logic.
export const resolveChannels = (
  event: NotifiableEvent,
  prefs: NotificationPrefRow | undefined,
): ChannelName[] =>
  event.channels.filter(
    (channel) =>
      (prefs?.[channel] ?? true) || channel === event.criticalChannel,
  );
