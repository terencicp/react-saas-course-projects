import 'server-only';

import { invoices } from '@/server/store';
import type { Invoice } from '@/server/types';

// This is the ONLY sanctioned way reads touch invoices. A bare `store.invoices`
// read anywhere else (outside this helper and the inspector's count panels) is
// the review red flag.
//
// `scopedInvoices(orgId)` should return three honestly-distinct, tenant-scoped
// views over the store — the in-memory analogue of the Drizzle `$dynamic()`
// builder. Callers compose status/sort/cursor onto whichever view it hands back.

// TODO(L3) — make active/archived/includingDeleted honest.
//
// Right now all three methods return the same org-filtered list (the chapter-061
// bug baseline): the lifecycle split is missing, so archived/deleted rows leak
// into the Active view. Use these predicates to make `active()` exclude both
// `archivedAt` and `deletedAt`, `archived()` keep only archived-not-deleted, and
// `includingDeleted()` keep everything in the org.
export const activeFilter = (inv: Invoice): boolean =>
  inv.deletedAt === null && inv.archivedAt === null;

export const archivedFilter = (inv: Invoice): boolean =>
  inv.archivedAt !== null && inv.deletedAt === null;

export type InvoiceQuery = {
  filter: (predicate: (inv: Invoice) => boolean) => InvoiceQuery;
  sort: (compare: (a: Invoice, b: Invoice) => number) => InvoiceQuery;
  cursorAfter: (cursor: string | null) => InvoiceQuery;
  take: (n: number) => Invoice[];
  hasPrev: () => boolean;
  hasMoreThan: (n: number) => boolean;
  find: (predicate: (inv: Invoice) => boolean) => Invoice | undefined;
};

const makeQuery = (rows: Invoice[], hadPrev: boolean): InvoiceQuery => ({
  filter: (predicate) => makeQuery(rows.filter(predicate), hadPrev),
  sort: (compare) => makeQuery([...rows].sort(compare), hadPrev),
  cursorAfter: (cursor) => {
    if (!cursor) {
      return makeQuery(rows, false);
    }
    const at = rows.findIndex((inv) => inv.id === cursor);
    return at >= 0
      ? makeQuery(rows.slice(at + 1), true)
      : makeQuery(rows, false);
  },
  take: (n) => rows.slice(0, n),
  hasPrev: () => hadPrev,
  hasMoreThan: (n) => rows.length > n,
  find: (predicate) => rows.find(predicate),
});

export const scopedInvoices = (orgId: string) => {
  const inOrg = (): Invoice[] => invoices.filter((inv) => inv.orgId === orgId);

  // Naive baseline: all three views return the same org list (no lifecycle
  // split). The student makes them honest in L3.
  return {
    active: () => makeQuery(inOrg(), false),
    archived: () => makeQuery(inOrg(), false),
    includingDeleted: () => makeQuery(inOrg(), false),
  };
};
