// TODO(L3) — declare Relations v1 per table: organization↦(orgMembers,customers,invoices), invoice↦(organization,customer,createdBy user,lines), etc.
import { relations } from 'drizzle-orm';

import {
  customers,
  invoiceLines,
  invoices,
  organizations,
  orgMembers,
  users,
} from '@/db/schema';

export const organizationsRelations = relations(organizations, () => ({}));

export const usersRelations = relations(users, () => ({}));

export const orgMembersRelations = relations(orgMembers, () => ({}));

export const customersRelations = relations(customers, () => ({}));

export const invoicesRelations = relations(invoices, () => ({}));

export const invoiceLinesRelations = relations(invoiceLines, () => ({}));
