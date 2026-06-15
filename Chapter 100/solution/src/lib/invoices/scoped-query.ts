import 'server-only';

import { and, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';

import { invoices } from '@/db/schema';

// The ONLY sanctioned way reads compose the invoices lifecycle + org filter. A
// bare db.invoices read anywhere else (outside this helper and the inspector's
// raw-sql probes) is the review red flag.
//
// scopedInvoices(orgId) returns three honestly-distinct, tenant-scoped predicate
// builders over the real invoices table — the Drizzle re-expression of the ch062
// fluent shape. Each returns a composable `where` SQL the query helper threads
// into a tenantDb/db read. It is deliberately column-agnostic about money: it
// references only the lifecycle columns + organizationId, so it stays identical
// across the expand-migrate-contract cadence (no subtotal/tax/total reference).

// Predicate helpers shared by the helper and any hand-written read.
export const activeFilter = (): SQL =>
  and(isNull(invoices.deletedAt), isNull(invoices.archivedAt)) as SQL;

export const archivedFilter = (): SQL =>
  and(isNotNull(invoices.archivedAt), isNull(invoices.deletedAt)) as SQL;

export const scopedInvoices = (orgId: string) => {
  const inOrg = (extra?: SQL): SQL =>
    and(eq(invoices.organizationId, orgId), extra) as SQL;

  return {
    active: (): SQL => inOrg(activeFilter()),
    archived: (): SQL => inOrg(archivedFilter()),
    includingDeleted: (): SQL => inOrg(),
  };
};
