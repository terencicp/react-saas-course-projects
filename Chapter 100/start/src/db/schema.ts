import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

import { organization } from '@/db/schema/auth';

// The invoices table — carried in from the chapter-062 surface, re-expressed on
// Drizzle. It ships with the combined-amount anti-pattern: a single
// `total numeric(12,2) NOT NULL` column. The expand-migrate-contract cadence
// splits it into separate `subtotal` + `tax` columns across three reviewed
// migrations.
//
// organizationId is `text` (Better Auth org ids are base62 text, never uuid); the
// money columns are `numeric(12,2)` → `string` at the Drizzle runtime; only the
// standalone id PK (no incoming FK) stays uuid.
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
    status: text({ enum: ['draft', 'sent', 'paid', 'overdue'] })
      .notNull()
      .default('draft'),
    // The combined-amount anti-pattern this cadence fixes: one numeric(12,2)
    // column holding subtotal + tax mashed together.
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
    // TODO(L3) — add subtotal + tax nullable numeric(12,2)
    // TODO(L4) — promote subtotal/tax to NOT NULL after backfill
    // TODO(L5) — drop the total column
    currency: text().notNull().default('USD'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp({ withTimezone: true }),
    deletedAt: timestamp({ withTimezone: true }),
    archivedAt: timestamp({ withTimezone: true }),
    version: integer().notNull().default(1),
  },
  (t) => [
    index('idx_invoices_org_status_created').on(
      t.organizationId,
      t.status,
      t.createdAt.desc(),
    ),
    // Partial unique: a soft-deleted row frees its number for re-use while live
    // rows stay unique within the org. The partial predicate is a sql template.
    uniqueIndex('invoices_org_number_active_unique')
      .on(t.organizationId, t.number)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
