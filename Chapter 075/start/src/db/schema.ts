import { sql } from 'drizzle-orm';
import {
  bigint,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { timestamps } from '@/db/columns';

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

// The two operator-honest events a rate-limit gate can record. `rate_limit_rejected`
// is written by the action reject helper when a gate trips; `rate_limit_unavailable`
// is written by `safeLimit` when Redis is unreachable and the gate fails open.
export const rateLimitEvent = pgEnum('rate_limit_event', [
  'rate_limit_rejected',
  'rate_limit_unavailable',
]);

// The operator-honest log surface: every gate that rejects (with the honest gate +
// key) and every fail-open (Redis down) writes a row here. The inspector's
// structured-log tail reads it. The user-facing message stays opaque; the gate +
// key land only here — no information leak. pino + redaction is the production
// analog (named-not-built, Chapter 092); this is the project-local honest log.
export const rateLimitLog = pgTable('rate_limit_log', {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  event: rateLimitEvent().notNull(),
  limiter: text().notNull(),
  key: text().notNull(),
  remaining: integer().notNull(),
  // `reset` is a Unix-ms timestamp from the limiter — store the raw number so the
  // tail can render it as-is; bigint mode 'number' keeps it a JS number.
  reset: bigint({ mode: 'number' }).notNull(),
  firedAt: timestamp({ withTimezone: true, precision: 3 })
    .defaultNow()
    .notNull(),
});

export type RateLimitLog = typeof rateLimitLog.$inferSelect;
export type NewRateLimitLog = typeof rateLimitLog.$inferInsert;
