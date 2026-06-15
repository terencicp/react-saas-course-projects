import type { Customer, Invoice, InvoiceLine } from '@/db/schema';
import type { ListInvoicesInput } from '@/lib/invoices/schema';

// A row carries its customer so the list cell can show the customer name from a
// single round trip. The student replaces this with the inferred relational shape.
export type InvoiceListRow = Invoice & { customer: Customer };

// A placeholder for the nested detail shape. The student replaces this with the
// type derived from the findFirst result (NonNullable<Awaited<ReturnType<...>>>).
export type InvoiceDetail = Invoice & {
  customer: Customer;
  lines: InvoiceLine[];
};

export const listInvoices = async (
  _input: ListInvoicesInput,
): Promise<{ rows: InvoiceListRow[]; nextCursor: string | null }> => {
  // TODO(L5) — listInvoices: db.query.invoices.findMany with tenant+status+cursor where (callback), orderBy desc(createdAt,id), limit pageSize+1, with:{customer}; slice probe → {rows, nextCursor}.
  return { rows: [], nextCursor: null };
};

export const getInvoiceDetail = async (_args: {
  organizationId: string;
  invoiceId: string;
}): Promise<InvoiceDetail | null> => {
  // TODO(L6) — getInvoiceDetail: db.query.invoices.findFirst, where AND-includes id AND organizationId, with:{customer, lines orderBy position}; return result ?? null.
  return null;
};
