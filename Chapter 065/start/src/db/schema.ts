import { sql } from 'drizzle-orm';
import {
  bigint,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { timestamps } from '@/db/columns';
import { organization } from '@/db/schema/auth';

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
// the row trustworthy. Shipped PK-only for now — the seed provisions one free row per
// org against this PK, the inspector reads it, but the projected columns land in S3.
//
// TODO(L4) — add the columns (the canonical 064-L4 shape): plan/status closed enums,
// subscriptionId/currentPeriodEnd nullable, cancelAtPeriodEnd, seats, lastEventAt (the
// high-water mark — a timestamptz taking a Date, never raw Unix seconds), updatedAt;
// then `pnpm db:generate --name add_entitlement_columns` → review → migrate.
export const planEntitlements = pgTable('plan_entitlements', {
  organizationId: text()
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
});

export type PlanEntitlement = typeof planEntitlements.$inferSelect;
export type NewPlanEntitlement = typeof planEntitlements.$inferInsert;
