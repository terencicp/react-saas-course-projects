import 'server-only';

import { asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import type { Invoice, InvoiceNote } from '@/db/schema';
import { invoiceNotes, invoices } from '@/db/schema';

// The invoice + its user-submitted notes, scoped by org. The notes `body` is
// user-content (never operator-trustworthy); finding 2's seeded sink renders it
// unsanitized. Reads run against the seeded Postgres at first paint — no live worker.
export const getInvoiceWithNotes = async (
  orgId: string,
  invoiceId: string,
): Promise<{ invoice: Invoice; notes: InvoiceNote[] } | null> => {
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
  });
  if (!invoice || invoice.organizationId !== orgId) {
    return null;
  }

  const notes = await db.query.invoiceNotes.findMany({
    where: eq(invoiceNotes.invoiceId, invoiceId),
    orderBy: asc(invoiceNotes.createdAt),
  });

  return { invoice, notes };
};
