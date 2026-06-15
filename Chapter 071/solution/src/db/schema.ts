import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

import { timestamps } from '@/db/columns';
import { organization, user } from '@/db/schema/auth';

// The suppression reason is a closed set the bounce/complaint webhook
// (Chapter 063) writes; the send wrapper reads it to decide whether a
// transactional send may proceed (manual_unsubscribe never blocks transactional).
export const suppressionReason = pgEnum('suppression_reason', [
  'hard_bounce',
  'soft_bounce_threshold',
  'complaint',
  'manual_unsubscribe',
]);

// The deliverability suppression list. Read-only on this surface: rows arrive via
// the seed (or by hand); Chapter 063's webhook writer is the only code that
// inserts here later. `email` is normalized (trim + lowercase) before every write
// and read so the unique index and the wrapper's lookup always agree (load-bearing).
export const emailSuppressions = pgTable('email_suppressions', {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  email: text().notNull().unique('email_suppressions_email_unique'),
  reason: suppressionReason().notNull(),
  providerEventId: text(),
  bypassUntil: timestamp({ withTimezone: true }),
  metadata: jsonb(),
  ...timestamps,
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export type EmailSuppression = typeof emailSuppressions.$inferSelect;
export type NewEmailSuppression = typeof emailSuppressions.$inferInsert;

// The provider-agnostic idempotency ledger (carried from 063 L2). Every verified
// webhook event claims a row here inside the same transaction as its mutation; the
// unique(provider, eventId) makes a replayed delivery a no-op (onConflictDoNothing
// returns no row → claimEvent answers false → the route returns 200 duplicate). The
// bigint identity PK is the insertion-order surrogate; the natural key is the unique
// pair. A retention sweep over receivedAt is named-not-built (a later unit owns it).
export const processedEvents = pgTable(
  'processed_events',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    provider: text().notNull(),
    eventId: text().notNull(),
    eventType: text().notNull(),
    receivedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('processed_events_provider_event_unique').on(t.provider, t.eventId),
  ],
);

export type ProcessedEvent = typeof processedEvents.$inferSelect;
export type NewProcessedEvent = typeof processedEvents.$inferInsert;

// The derived entitlement view: one row per org, written ONLY by the Stripe webhook,
// read by every other surface (getEntitlement). The single-writer rule is what keeps
// the row trustworthy. plan/status are closed enums; the Stripe-derived columns
// (subscriptionId/currentPeriodEnd) are nullable (a free row has no subscription).
// lastEventAt is the high-water mark the ordering predicate compares against — a
// timestamptz, so it takes a Date (event.created * 1000), never the raw Unix seconds.
export const planEntitlements = pgTable('plan_entitlements', {
  organizationId: text()
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  plan: text({ enum: ['free', 'pro', 'team'] })
    .notNull()
    .default('free'),
  status: text({
    enum: ['trialing', 'active', 'past_due', 'canceled', 'incomplete'],
  })
    .notNull()
    .default('active'),
  subscriptionId: text(),
  currentPeriodEnd: timestamp({ withTimezone: true }),
  cancelAtPeriodEnd: boolean().notNull().default(false),
  seats: integer().notNull().default(1),
  lastEventAt: timestamp({ withTimezone: true }),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type PlanEntitlement = typeof planEntitlements.$inferSelect;
export type NewPlanEntitlement = typeof planEntitlements.$inferInsert;

// The in-app inbox feed. One row per delivered in-app notification, written ONLY by
// writeInboxChannel (the dispatcher's inbox channel); any direct write to this table
// outside lib/notifications/ is a regression. title/body are rendered once at dispatch and
// frozen here (render-at-dispatch), so the inbox UI is a pure read with no joins, immune to
// later actor-name drift. userId/orgId are `text` (Better Auth ids); ids default to uuidv7
// in app code, never a database-side default. readAt null = unread.
export const notifications = pgTable(
  'notifications',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    orgId: text().references(() => organization.id, { onDelete: 'cascade' }),
    eventType: text().notNull(),
    subjectId: text().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_notifications_user_created').on(t.userId, t.createdAt.desc()),
    index('idx_notifications_user_unread')
      .on(t.userId)
      .where(sql`read_at is null`),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

// Per-category, per-channel opt-out. Read once per dispatch (batched) and applied
// default-on (`?? true` — a missing row receives everything). NO orgId: prefs are
// user-scoped, they follow the user across orgs, so the tenant-leading-column rule does
// not apply. The named (userId, category) unique is what the inspector's UPSERT conflicts
// on. push is reserved at the column with no channel consumer in this project.
export const userNotificationPreferences = pgTable(
  'user_notification_preferences',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    category: text().notNull(),
    email: boolean().notNull().default(true),
    inbox: boolean().notNull().default(true),
    push: boolean().notNull().default(true),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('user_notification_preferences_user_id_category_unique').on(
      t.userId,
      t.category,
    ),
  ],
);

export type UserNotificationPreference =
  typeof userNotificationPreferences.$inferSelect;
export type NewUserNotificationPreference =
  typeof userNotificationPreferences.$inferInsert;

// The time-windowed dedup ledger. One row per (eventType, dedupKey, recipientUserId)
// fan-out; the dispatcher's isDuplicate selects the most-recent row inside the registry's
// window before fanning out, collapsing a burst to one. recipientUserId is load-bearing in
// the key (two recipients getting the same event is not a duplicate). NO orgId
// (user-scoped bookkeeping). The composite index leads with the lookup columns and sorts
// firedAt desc for the most-recent probe.
export const notificationDedup = pgTable(
  'notification_dedup',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    eventType: text().notNull(),
    dedupKey: text().notNull(),
    recipientUserId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    firedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_notification_dedup_lookup').on(
      t.eventType,
      t.dedupKey,
      t.recipientUserId,
      t.firedAt.desc(),
    ),
  ],
);

export type NotificationDedup = typeof notificationDedup.$inferSelect;
export type NewNotificationDedup = typeof notificationDedup.$inferInsert;
