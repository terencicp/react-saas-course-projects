// TODO(L3) — author the six tables (organizations, users stub, org_members, customers, invoices, invoice_lines) with PKs, FKs+onDelete, tenant-scoped uniques, the total>=0 check, and the three invoices indexes; co-locate $inferSelect/$inferInsert type exports.
import { sql } from 'drizzle-orm';
import {
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { timestamps } from '@/db/columns';

export const organizations = pgTable('organizations', {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  name: text().notNull(),
  slug: text().notNull(),
  ...timestamps,
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export const users = pgTable('users', {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  email: text().notNull(),
  name: text().notNull(),
  ...timestamps,
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const orgMembers = pgTable('org_members', {
  organizationId: uuid().notNull(),
  userId: uuid().notNull(),
  role: text().notNull(),
  ...timestamps,
});

export type OrgMember = typeof orgMembers.$inferSelect;
export type NewOrgMember = typeof orgMembers.$inferInsert;

export const customers = pgTable('customers', {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  organizationId: uuid().notNull(),
  name: text().notNull(),
  email: text().notNull(),
  ...timestamps,
});

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

export const invoices = pgTable('invoices', {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  organizationId: uuid().notNull(),
  customerId: uuid().notNull(),
  createdBy: uuid().notNull(),
  number: text().notNull(),
  status: text().notNull(),
  total: numeric({ precision: 12, scale: 2 }).notNull(),
  currency: text().notNull(),
  issuedAt: timestamp({ withTimezone: true }).notNull(),
  dueAt: timestamp({ withTimezone: true }).notNull(),
  ...timestamps,
});

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

export const invoiceLines = pgTable('invoice_lines', {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  invoiceId: uuid().notNull(),
  description: text().notNull(),
  quantity: numeric({ precision: 12, scale: 2 }).notNull(),
  unitPrice: numeric({ precision: 12, scale: 2 }).notNull(),
  position: integer().notNull(),
  ...timestamps,
});

export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type NewInvoiceLine = typeof invoiceLines.$inferInsert;
