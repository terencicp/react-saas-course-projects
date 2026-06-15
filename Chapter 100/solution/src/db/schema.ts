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
// Drizzle. The combined-amount anti-pattern is gone: the expand-migrate-contract
// cadence split it into separate `subtotal` + `tax` columns, and the contract
// migration dropped the old combined column. The combined amount is now a derived
// display value (subtotal + tax) computed at the app layer, never a column.
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
    // The target money shape: two NOT NULL numeric(12,2) columns. The contract
    // migration dropped the old combined column; the combined amount is derived
    // (subtotal + tax) at the app layer. Precision/scale matched the old combined
    // column exactly — copy the producer's type for money columns or risk
    // silent corruption.
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
    tax: numeric('tax', { precision: 12, scale: 2 }).notNull(),
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
