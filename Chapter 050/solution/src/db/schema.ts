import { sql } from 'drizzle-orm';
import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { timestamps } from '@/db/columns';

export const organizations = pgTable('organizations', {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  name: text().notNull(),
  slug: text().notNull().unique('organizations_slug_unique'),
  ...timestamps,
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export const users = pgTable('users', {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  email: text().notNull().unique('users_email_unique'),
  name: text().notNull(),
  ...timestamps,
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

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
// the seed; Chapter 063's webhook writer is the only code that inserts here later.
// `email` is normalized (trim + lowercase) before every write and read so the
// unique index and the wrapper's lookup always agree (load-bearing).
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
