import 'server-only';

import { count, desc, eq, lt } from 'drizzle-orm';

import { db } from '@/db';
import type { Invoice } from '@/db/schema';
import { invoices } from '@/db/schema';
import { tenantDb } from '@/db/tenant';

// The Chapter 062 read, re-homed onto Drizzle. The export pages over the `active`
// view (the only view it uses) with createdAt-desc cursor pagination — the stable
// restart point a mid-run crash resumes from. Both reads are tenant-scoped via
// tenantDb: the task has no request context, so it re-derives tenancy from the
// payload organizationId here, never from a session.

export type InvoiceView = 'active';

export type ListInvoicesArgs = {
  orgId: string;
  view: InvoiceView;
  cursor: string | null;
  pageSize?: number;
};

export type ListInvoicesResult = {
  rows: Invoice[];
  nextCursor: string | null;
};

// The cursor is the createdAt of the last row of the previous page (ISO string).
// createdAt-desc means "older than the cursor" is the next page; ties are rare with
// millisecond timestamps and a seed that spaces rows, so the cursor stays on
// createdAt alone (the index is org-leading, createdAt-desc). A production hardening
// would add the id as a tiebreaker — named, not built (the seed avoids collisions).
export const listInvoices = async ({
  orgId,
  cursor,
  pageSize = 500,
}: ListInvoicesArgs): Promise<ListInvoicesResult> => {
  const cursorDate = cursor ? new Date(cursor) : null;

  const rows = await tenantDb(orgId).query.invoices.findMany({
    where: cursorDate ? lt(invoices.createdAt, cursorDate) : undefined,
    orderBy: desc(invoices.createdAt),
    limit: pageSize,
  });

  const last = rows.at(-1);
  const nextCursor =
    rows.length === pageSize && last ? last.createdAt.toISOString() : null;

  return { rows, nextCursor };
};

// The count(*) the parent reads to compute pagesTotal. Tenant-scoped: the org
// predicate is applied via a direct count over the org's rows (the relational query
// API has no count aggregate, so this uses the core select with the same org filter
// tenantDb enforces on every other invoices read).
export const countInvoices = async ({
  orgId,
}: {
  orgId: string;
}): Promise<number> => {
  const [row] = await db
    .select({ value: count() })
    .from(invoices)
    .where(eq(invoices.organizationId, orgId));
  return row?.value ?? 0;
};
