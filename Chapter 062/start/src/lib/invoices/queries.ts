import 'server-only';

import { scopedInvoices } from '@/lib/invoices/scoped-query';
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

// TODO(L3) — route on view + gate all to admin.
//
// This baseline ignores `view` and `role` (always reads `active()`), so the
// view tabs do not change the result set and `?view=all` is never gated. The
// student routes `active`/`archived`/`all` onto the matching scoped-query view
// and drops `all` to `active` unless `role === 'admin'` at the read.
export const listInvoices = ({
  orgId,
  view: _view,
  status,
  sort,
  q,
  cursor,
  role: _role,
  pageSize = 20,
}: ListInvoicesArgs): ListInvoicesResult => {
  const base = scopedInvoices(orgId).active();

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

  return { rows: page, nextCursor, hasPrev: paged.hasPrev() };
};

export type GetInvoiceDetailArgs = {
  orgId: string;
  id: string;
  role: Role;
};

// TODO(L3) — route on view + gate all to admin.
//
// This baseline ignores `role`: it loads any row in the org. The student routes
// it so archived rows load for restore and soft-deleted rows load only for an
// admin.
export const getInvoiceDetail = ({
  orgId,
  id,
  role: _role,
}: GetInvoiceDetailArgs): Invoice | null =>
  scopedInvoices(orgId)
    .active()
    .find((inv) => inv.id === id) ?? null;
