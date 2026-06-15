import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { timestamps } from '@/db/columns';

export const memberRole = pgEnum('member_role', ['owner', 'admin', 'member']);

export const invoiceStatus = pgEnum('invoice_status', [
  'draft',
  'sent',
  'paid',
  'overdue',
]);

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

export const orgMembers = pgTable(
  'org_members',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole().notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId] })],
);

export type OrgMember = typeof orgMembers.$inferSelect;
export type NewOrgMember = typeof orgMembers.$inferInsert;

export const customers = pgTable(
  'customers',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    email: text().notNull(),
    ...timestamps,
  },
  (t) => [unique('customers_org_email_unique').on(t.organizationId, t.email)],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

export const invoices = pgTable(
  'invoices',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    number: text().notNull(),
    status: invoiceStatus().notNull().default('draft'),
    total: numeric({ precision: 12, scale: 2 }).notNull(),
    currency: text().notNull().default('USD'),
    issuedAt: timestamp({ withTimezone: true }).notNull(),
    dueAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    unique('invoices_org_number_unique').on(t.organizationId, t.number),
    check('invoices_total_nonneg', sql`${t.total} >= 0`),
    index('idx_invoices_org_status_created_at_id').on(
      t.organizationId,
      t.status,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    index('idx_invoices_org_created_at_id').on(
      t.organizationId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    index('idx_invoices_customer_id').on(t.customerId),
  ],
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

export const invoiceLines = pgTable(
  'invoice_lines',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    invoiceId: uuid()
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    description: text().notNull(),
    quantity: numeric({ precision: 12, scale: 2 }).notNull(),
    unitPrice: numeric({ precision: 12, scale: 2 }).notNull(),
    position: integer().notNull(),
    ...timestamps,
  },
  (t) => [
    unique('invoice_lines_invoice_position_unique').on(t.invoiceId, t.position),
  ],
);

export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type NewInvoiceLine = typeof invoiceLines.$inferInsert;
