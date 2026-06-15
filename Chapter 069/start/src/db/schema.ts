import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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

// The Chapter 062 invoices shape, re-homed onto Drizzle. The export reads only the
// `active` view — there is no soft-delete/archive split here (those columns were a
// 062 list-management concern; this project carries just the rows + the cursor
// index). organizationId is `text` (FK → organization.id): Better Auth ids are
// base62 text, so a uuid FK→text emits DDL Postgres rejects.
//
// The PK is uuid with $defaultFn(uuidv7) — the same monotonic id the audit table
// uses, so seeded rows sort stably by id. createdAt is the cursor's sort key; the
// composite index leads with organizationId (tenant-leading) then createdAt desc,
// the shape `listInvoices` pages over.
export const invoices = pgTable(
  'invoices',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    number: text().notNull(),
    customerName: text().notNull(),
    status: text({ enum: ['draft', 'sent', 'paid', 'overdue'] }).notNull(),
    total: numeric().notNull(),
    currency: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    dueAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('idx_invoices_org_created').on(t.organizationId, t.createdAt.desc()),
  ],
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

// The app-side dedup + audit reference for an export run. Trigger.dev's own run
// record is the operational truth; this row exists so the daily business key can
// dedup a re-trigger and the inspector can render a run panel from persisted state
// (no live worker needed at render time).
//
// The row is inserted `queued` before the trigger (so it exists for the daily-key
// dedup), updated with `runId` after the trigger returns, and closed to `completed`
// from the task body. `dayBucket` (text, YYYY-MM-DD) is the business-key column the
// unique index dedups on: one export per org-user-day.
//
// requestedBy is `text` (FK → user.id); organizationId is `text` (FK →
// organization.id) — both Better Auth base62 ids, never uuid.
export const exports = pgTable(
  'exports',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    requestedBy: text()
      .notNull()
      .references(() => user.id),
    status: text({ enum: ['queued', 'running', 'completed', 'failed'] })
      .notNull()
      .default('queued'),
    runId: text(),
    rowCount: integer(),
    idempotencyKey: text(),
    dayBucket: text().notNull(),
    pagesDone: integer(),
    pagesTotal: integer(),
    downloadUrl: text(),
    requestedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('exports_org_requester_day_unique').on(
      t.organizationId,
      t.requestedBy,
      t.dayBucket,
    ),
  ],
);

export type ExportRow = typeof exports.$inferSelect;
export type NewExportRow = typeof exports.$inferInsert;

// The Chapter 068 user-upload metadata row. One row per completed browser-to-R2
// upload, written by finalizeUpload only AFTER the post-upload HEAD confirms the
// object — never row-before-bytes, so a never-finished upload leaves no orphan row.
//
// id is a standalone uuid PK ($defaultFn(uuidv7) for app inserts; the action supplies
// the server-generated uploadId so the key segment and the row id agree). It takes no
// incoming FK — file_metadata joins nothing.
//
// objectKey is server-constructed (`org/${orgId}/files/${id}.${ext}`) and GLOBALLY
// unique (not partial): a soft-deleted key stays reserved while its bytes may still
// exist, and a replayed finalize trips the constraint → conflict.
//
// byteSize is bigint (mode:'number') — the HEAD-verified size, never the client's
// claim; a check constraint keeps it non-negative. uploadedBy is a `text` FK (Better
// Auth base62 ids) with onDelete set null so a removed user does not cascade away the
// file row.
//
// The composite index is tenant-leading then softDeletedAt then uploadedAt desc, id
// desc — it skips deleted rows and serves the newest-first keyset the list pages over.
export const fileMetadata = pgTable(
  'file_metadata',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    uploadedBy: text().references(() => user.id, { onDelete: 'set null' }),
    objectKey: text().notNull().unique('file_metadata_object_key_unique'),
    originalFileName: text().notNull(),
    contentType: text().notNull(),
    byteSize: bigint({ mode: 'number' }).notNull(),
    uploadedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    softDeletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('idx_file_metadata_org_active').on(
      t.organizationId,
      t.softDeletedAt,
      t.uploadedAt.desc(),
      t.id.desc(),
    ),
    check('file_metadata_byte_size_nonneg', sql`${t.byteSize} >= 0`),
  ],
);

export type FileMetadata = typeof fileMetadata.$inferSelect;
export type NewFileMetadata = typeof fileMetadata.$inferInsert;
