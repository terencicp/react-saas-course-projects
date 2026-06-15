import 'server-only';

import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import type { Customer, Invoice } from '@/db/schema';
import { customers, invoices } from '@/db/schema';

// The dashboard's invoice-with-customer read (Chapter 095).
//
// SEEDED AUDIT DEFECT #8 (finding 8, L6) — N+1 at the Drizzle layer (094 L7): this
// runs ONE `db.select().from(invoices)` then LOOPS, firing a separate
// `db.select().from(customers)` per invoice — 1 + N queries per render. It renders
// correct data, just slowly. The documented fix (NOT applied — this is a
// documentation finding) is the relations API (`findMany` expanding the customer
// relation), which emits ONE lateral-join statement (verifiable with `.toSQL()`).
// Kept in a dedicated helper so the N+1 grep stays falsifiable — the healthy
// src/db/queries/invoices.ts uses the relations API and must stay healthy. The exact
// fix shape lives in findings/008-n-plus-1-invoices.md.
export type InvoiceWithCustomer = Invoice & { customer: Customer | null };

export const listInvoicesWithCustomer = async ({
  orgId,
  limit = 30,
}: {
  orgId: string;
  limit?: number;
}): Promise<InvoiceWithCustomer[]> => {
  // 1 query: the invoice rows.
  const rows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.organizationId, orgId))
    .orderBy(desc(invoices.createdAt))
    .limit(limit);

  // SEEDED #8: N queries — one customer lookup per invoice, in a loop.
  const result: InvoiceWithCustomer[] = [];
  for (const invoice of rows) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, invoice.customerId))
      .limit(1);
    result.push({ ...invoice, customer: customer ?? null });
  }

  return result;
};
