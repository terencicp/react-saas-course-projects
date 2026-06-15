import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
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

// The per-invoice customer (Chapter 095). A real customer row per invoice so finding
// 8's N+1 has a row to loop over and the documented fix (the relations API) has a
// real relation to expand. organizationId is `text` (FK → organization.id).
export const customers = pgTable(
  'customers',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    email: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_customers_org').on(t.organizationId)],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

// The Chapter 062 invoices shape, re-homed onto Drizzle, now carrying a real
// customerId FK (Chapter 095). organizationId is `text` (FK → organization.id):
// Better Auth ids are base62 text, so a uuid FK→text emits DDL Postgres rejects.
//
// The PK is uuid with $defaultFn(uuidv7) — the same monotonic id the audit table
// uses, so seeded rows sort stably by id. createdAt is the cursor's sort key.
//
// SEEDED BONUS DEFECT #10 (finding 10, optional) — missing composite index (094 L7):
// the table ships WITHOUT a composite `(organization_id, created_at)` index — only
// the PK — so `EXPLAIN ANALYZE` over the org-scoped, createdAt-ordered query shows a
// Seq Scan + an in-memory sort. The healthy fix (documented; the migration is a
// by-hand student step, NOT committed) declares the composite index here.
export const invoices = pgTable('invoices', {
  id: uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  organizationId: text()
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  customerId: uuid()
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  number: text().notNull(),
  customerName: text().notNull(),
  status: text({ enum: ['draft', 'sent', 'paid', 'overdue'] }).notNull(),
  total: numeric().notNull(),
  currency: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  dueAt: timestamp({ withTimezone: true }),
});

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

// Relations v1 (finding 8's documented fix surface). The invoice → customer relation
// is what `db.query.invoices.findMany({ with: { customer: true } })` expands in ONE
// statement — the relations API is N+1-safe.
export const invoicesRelations = relations(invoices, ({ one }) => ({
  customer: one(customers, {
    fields: [invoices.customerId],
    references: [customers.id],
  }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  invoices: many(invoices),
}));

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

// User-submitted free-text notes on an invoice. The body is whatever a user typed —
// it is NEVER operator-trustworthy. SEEDED AUDIT DEFECT #2 (finding 2) renders this
// `body` through dangerouslySetInnerHTML with no sanitization in
// src/app/(protected)/invoices/[id]/notes.tsx; the seed plants a row whose body
// contains `<b>bold</b>` so the running app renders it as live bold HTML.
export const invoiceNotes = pgTable(
  'invoice_notes',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    invoiceId: uuid()
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    authorId: text().references(() => user.id, { onDelete: 'set null' }),
    body: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_invoice_notes_invoice').on(t.invoiceId)],
);

export type InvoiceNote = typeof invoiceNotes.$inferSelect;
export type NewInvoiceNote = typeof invoiceNotes.$inferInsert;

// The two operator-honest events a rate-limit gate can record (075 carry).
// `rate_limit_rejected` is written by the action reject helper when a gate trips;
// `rate_limit_unavailable` is written by `safeLimit` when Redis is unreachable and
// the gate fails open.
export const rateLimitEvent = pgEnum('rate_limit_event', [
  'rate_limit_rejected',
  'rate_limit_unavailable',
]);

// The operator-honest log surface (075 carry): every gate that rejects (with the
// honest gate + key) and every fail-open (Redis down) writes a row here. The
// user-facing message stays opaque; the gate + key land only here — no information
// leak.
export const rateLimitLog = pgTable('rate_limit_log', {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  event: rateLimitEvent().notNull(),
  limiter: text().notNull(),
  key: text().notNull(),
  remaining: integer().notNull(),
  reset: bigint({ mode: 'number' }).notNull(),
  firedAt: timestamp({ withTimezone: true, precision: 3 })
    .defaultNow()
    .notNull(),
});

export type RateLimitLog = typeof rateLimitLog.$inferSelect;
export type NewRateLimitLog = typeof rateLimitLog.$inferInsert;

// The provider-agnostic idempotency ledger (065 carry). Every verified webhook event
// claims a row here inside the same transaction as its mutation; unique(provider,
// eventId) makes a replayed delivery a no-op.
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

// The derived entitlement view (065 carry): one row per org, written ONLY by the
// Stripe webhook, read by every other surface (getEntitlement). The single-writer
// rule is what keeps the row trustworthy.
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
