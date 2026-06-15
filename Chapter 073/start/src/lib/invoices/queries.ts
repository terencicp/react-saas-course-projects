import 'server-only';

import { scopedInvoices } from '@/lib/invoices/scoped-query';
import { getSummaryRow } from '@/server/store';
import type { Invoice, InvoiceStatus, Role } from '@/server/types';

export type InvoiceSort =
  | '-createdAt'
  | 'createdAt'
  | '-total'
  | 'total'
  | '-customer'
  | 'customer';

export type InvoiceView = 'active' | 'archived' | 'all';

// The settled view-state slice the page reads from the URL and threads into the
// toolbar, chips, and view tabs. S1 produces this from the searchParamsCache.
export type ListParsed = {
  status: InvoiceStatus | null;
  sort: InvoiceSort;
  view: InvoiceView;
  q: string;
  cursor: string | null;
};

export type ListInvoicesArgs = {
  orgId: string;
  view: InvoiceView;
  status: InvoiceStatus | null;
  sort: InvoiceSort;
  q: string;
  cursor: string | null;
  role: Role;
  pageSize?: number;
};

export type ListInvoicesResult = {
  rows: Invoice[];
  nextCursor: string | null;
  hasPrev: boolean;
};

const compareBySort = (a: Invoice, b: Invoice, sort: InvoiceSort): number => {
  switch (sort) {
    case 'createdAt':
      return a.createdAt.localeCompare(b.createdAt);
    case '-createdAt':
      return b.createdAt.localeCompare(a.createdAt);
    case 'total':
      return Number(a.total) - Number(b.total);
    case '-total':
      return Number(b.total) - Number(a.total);
    case 'customer':
      return a.customerName.localeCompare(b.customerName);
    case '-customer':
      return b.customerName.localeCompare(a.customerName);
  }
};

// The read-layer RBAC gate: `all` collapses to `active` for non-admins, so a
// member hand-typing `?view=all` is served active rows regardless of the URL.
const resolveView = (view: InvoiceView, role: Role): InvoiceView =>
  view === 'all' && role !== 'admin' ? 'active' : view;

export const listInvoices = async ({
  orgId,
  view,
  status,
  sort,
  q,
  cursor,
  role,
  pageSize = 20,
}: ListInvoicesArgs): Promise<ListInvoicesResult & { fetchedAt: string }> => {
  // TODO(L2) — add 'use cache' + cacheLife + cacheTag (detail carries record + list tags)
  const scoped = scopedInvoices(orgId);
  const resolved = resolveView(view, role);
  const base =
    resolved === 'archived'
      ? scoped.archived()
      : resolved === 'all'
        ? scoped.includingDeleted()
        : scoped.active();

  const needle = q.trim().toLowerCase();

  // Compose status/search/sort/cursor onto the chosen view, then page it.
  const paged = base
    .filter((inv) => (status ? inv.status === status : true))
    .filter((inv) =>
      needle
        ? inv.customerName.toLowerCase().includes(needle) ||
          inv.number.toLowerCase().includes(needle)
        : true,
    )
    .sort((a, b) => compareBySort(a, b, sort))
    .cursorAfter(cursor);

  const page = paged.take(pageSize);
  const nextCursor = paged.hasMoreThan(pageSize)
    ? (page[page.length - 1]?.id ?? null)
    : null;

  // `fetchedAt` is the cache-state window. Once 'use cache' wraps this body it is
  // computed once per cache entry — stable across requests = hit, advancing = miss.
  return {
    rows: page,
    nextCursor,
    hasPrev: paged.hasPrev(),
    fetchedAt: new Date().toISOString(),
  };
};

// The per-org aggregate read. New in chapter 073: reads the summary row if a job
// (or action) has written one; otherwise computes a live fallback over the active
// rows, so the read works from minute one against the empty seed.
export const getOrgInvoiceSummary = async (
  orgId: string,
): Promise<{
  totalCount: number;
  totalAmount: number;
  updatedAt: string;
  fetchedAt: string;
}> => {
  // TODO(L2) — add 'use cache' + cacheLife + cacheTag (detail carries record + list tags)
  const row = getSummaryRow(orgId);
  if (row) {
    return {
      totalCount: row.totalCount,
      totalAmount: row.totalAmount,
      updatedAt: row.updatedAt,
      fetchedAt: new Date().toISOString(),
    };
  }

  // Live fallback: count + sum(total) over the active (non-archived,
  // non-deleted) rows for this org.
  const active = scopedInvoices(orgId).active().take(Number.MAX_SAFE_INTEGER);
  const totalCount = active.length;
  const totalAmount = active.reduce((sum, inv) => sum + Number(inv.total), 0);
  return {
    totalCount,
    totalAmount,
    updatedAt: new Date(0).toISOString(),
    fetchedAt: new Date().toISOString(),
  };
};

export type GetInvoiceDetailArgs = {
  orgId: string;
  id: string;
  role: Role;
};

export const getInvoiceDetail = async ({
  orgId,
  id,
  role,
}: GetInvoiceDetailArgs): Promise<(Invoice & { fetchedAt: string }) | null> => {
  // TODO(L2) — add 'use cache' + cacheLife + cacheTag (detail carries record + list tags)
  // Active + archived rows load for everyone (archived so the row can be
  // restored); a soft-deleted row only loads for an admin.
  const scoped = scopedInvoices(orgId);
  const live = scoped.archived().find((inv) => inv.id === id);
  if (live) {
    return { ...live, fetchedAt: new Date().toISOString() };
  }
  const active = scoped.active().find((inv) => inv.id === id);
  if (active) {
    return { ...active, fetchedAt: new Date().toISOString() };
  }
  if (role === 'admin') {
    const deleted = scoped.includingDeleted().find((inv) => inv.id === id);
    return deleted ? { ...deleted, fetchedAt: new Date().toISOString() } : null;
  }
  return null;
};
