import { encodeCursor } from '@/db/cursor';
import { db } from '@/db/index';
import type { ListInvoicesInput } from '@/lib/invoices/schema';

const listInvoiceRows = (input: ListInvoicesInput) => {
  const { organizationId, status, cursor, pageSize } = input;

  return db.query.invoices.findMany({
    where: (t, { and, eq, lt, or }) =>
      and(
        eq(t.organizationId, organizationId),
        status ? eq(t.status, status) : undefined,
        // The compound cursor predicate: rows strictly older than the cursor's
        // createdAt, plus rows at the same createdAt with a smaller id (the
        // (createdAt, id) tiebreaker). createdAt is pinned to millisecond
        // precision, so the cursor's ISO string round-trips exactly.
        cursor
          ? or(
              lt(t.createdAt, new Date(cursor.createdAt)),
              and(
                eq(t.createdAt, new Date(cursor.createdAt)),
                lt(t.id, cursor.id),
              ),
            )
          : undefined,
      ),
    orderBy: (t, { desc }) => [desc(t.createdAt), desc(t.id)],
    limit: pageSize + 1,
    with: { customer: true },
  });
};

export type InvoiceListRow = Awaited<
  ReturnType<typeof listInvoiceRows>
>[number];

export const listInvoices = async (
  input: ListInvoicesInput,
): Promise<{ rows: InvoiceListRow[]; nextCursor: string | null }> => {
  const { pageSize } = input;

  const rows = await listInvoiceRows(input);

  // Fetched pageSize + 1: the extra row proves a next page exists. Drop it and
  // emit a cursor from the last kept row; otherwise this is the final page.
  const hasNextPage = rows.length > pageSize;
  const kept = hasNextPage ? rows.slice(0, pageSize) : rows;
  const last = kept.at(-1);

  const nextCursor =
    hasNextPage && last
      ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
      : null;

  return { rows: kept, nextCursor };
};

const findInvoiceDetail = (args: {
  organizationId: string;
  invoiceId: string;
}) =>
  db.query.invoices.findFirst({
    // The tenant guard AND-includes organizationId in the where, so a guessed id
    // from another org returns nothing — the filter is the security boundary,
    // never a post-load check.
    where: (t, { and, eq }) =>
      and(eq(t.id, args.invoiceId), eq(t.organizationId, args.organizationId)),
    with: {
      customer: true,
      lines: { orderBy: (t, { asc }) => [asc(t.position)] },
    },
  });

export type InvoiceDetail = NonNullable<
  Awaited<ReturnType<typeof findInvoiceDetail>>
>;

export const getInvoiceDetail = async (args: {
  organizationId: string;
  invoiceId: string;
}): Promise<InvoiceDetail | null> => {
  const invoice = await findInvoiceDetail(args);

  return invoice ?? null;
};
