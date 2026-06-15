import 'server-only';

import { and, desc, eq, gt, sql } from 'drizzle-orm';

import { db } from '@/db';
import { notificationDedup } from '@/db/schema';

import { notifiableEvents } from './registry';
import type { NotificationEvent } from './types';

// Time-windowed dedup: a burst of the same (eventType, dedupKey, recipientUserId) inside
// the registry's window collapses to one notification. recipientUserId is part of the key
// — two recipients getting the same event is not a duplicate. The check (isDuplicate) sits
// after prefs and before channels; the record (recordDedup) lands after a successful
// fan-out. The check-then-insert race is accepted in v1 (one duplicate per rare concurrent
// burst); the unique-constraint upgrade — a partial unique on the key + onConflictDoNothing
// — is the deferred hardening.

type DedupArgs = {
  event: NotificationEvent;
  userId: string;
  payload: Record<string, unknown>;
};

// Build the dedup key by joining the registry entry's keyBy field values with ':'.
// subjectId is read off the event; every other key is read off the payload.
export const computeDedupKey = (
  event: NotificationEvent,
  payload: Record<string, unknown>,
): string => {
  const eventDef = notifiableEvents[event.type];
  return eventDef.dedup.keyBy
    .map((key) =>
      key === 'subjectId' ? event.subjectId : String(payload[key]),
    )
    .join(':');
};

// True when a matching row was fired inside the window (firedAt > now() - window). Selects
// the most-recent row by the composite index's lookup columns + firedAt desc.
export const isDuplicate = async ({
  event,
  userId,
  payload,
}: DedupArgs): Promise<boolean> => {
  const eventDef = notifiableEvents[event.type];
  const dedupKey = computeDedupKey(event, payload);
  const since = sql`now() - make_interval(secs => ${eventDef.dedup.windowSeconds})`;
  const row = await db
    .select({ id: notificationDedup.id })
    .from(notificationDedup)
    .where(
      and(
        eq(notificationDedup.eventType, event.type),
        eq(notificationDedup.dedupKey, dedupKey),
        eq(notificationDedup.recipientUserId, userId),
        gt(notificationDedup.firedAt, since),
      ),
    )
    .orderBy(desc(notificationDedup.firedAt))
    .limit(1);
  return row.length > 0;
};

// Insert one dedup row marking this (eventType, dedupKey, recipientUserId) as fired now.
export const recordDedup = async ({
  event,
  userId,
  payload,
}: DedupArgs): Promise<void> => {
  await db.insert(notificationDedup).values({
    eventType: event.type,
    dedupKey: computeDedupKey(event, payload),
    recipientUserId: userId,
  });
};
