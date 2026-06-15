import { relations } from 'drizzle-orm';

import { invoices } from '@/db/schema';
import { organization } from '@/db/schema/auth';

// Relations v1: ship the file even though the list is flat per-org, so
// db.query.invoices resolves and any traversal (invoice → organization) is typed.
export const invoicesRelations = relations(invoices, ({ one }) => ({
  organization: one(organization, {
    fields: [invoices.organizationId],
    references: [organization.id],
  }),
}));
