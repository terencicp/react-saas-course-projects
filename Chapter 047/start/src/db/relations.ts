import { relations } from 'drizzle-orm';

import {
  customers,
  invoiceLines,
  invoices,
  organizations,
  orgMembers,
  users,
} from '@/db/schema';

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(orgMembers),
  customers: many(customers),
  invoices: many(invoices),
}));

export const usersRelations = relations(users, ({ many }) => ({
  members: many(orgMembers),
  invoices: many(invoices, { relationName: 'createdByUser' }),
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [orgMembers.userId],
    references: [users.id],
  }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [customers.organizationId],
    references: [organizations.id],
  }),
  invoices: many(invoices),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [invoices.organizationId],
    references: [organizations.id],
  }),
  customer: one(customers, {
    fields: [invoices.customerId],
    references: [customers.id],
  }),
  createdByUser: one(users, {
    relationName: 'createdByUser',
    fields: [invoices.createdBy],
    references: [users.id],
  }),
  lines: many(invoiceLines),
}));

export const invoiceLinesRelations = relations(invoiceLines, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceLines.invoiceId],
    references: [invoices.id],
  }),
}));
