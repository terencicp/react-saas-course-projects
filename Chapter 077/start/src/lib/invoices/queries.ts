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

// The read-layer RBAC gate: `all` collapses to `active` for non-admins, so a
// member hand-typing `?view=all` is served active rows regardless of the URL.
const resolveView = (view: InvoiceView, role: Role): InvoiceView =>
  view === 'all' && role !== 'admin' ? 'active' : view;

export const listInvoices = ({
  orgId,
  view,
  status,
  sort,
  q,
  cursor,
  role,
  pageSize = 20,
}: ListInvoicesArgs): ListInvoicesResult => {
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

  return { rows: page, nextCursor, hasPrev: paged.hasPrev() };
};

export type GetInvoiceDetailArgs = {
  orgId: string;
  id: string;
  role: Role;
};

export const getInvoiceDetail = ({
  orgId,
  id,
  role,
}: GetInvoiceDetailArgs): Invoice | null => {
  // Active + archived rows load for everyone (archived so the row can be
  // restored); a soft-deleted row only loads for an admin.
  const scoped = scopedInvoices(orgId);
  const live = scoped.archived().find((inv) => inv.id === id);
  if (live) {
    return live;
  }
  const active = scoped.active().find((inv) => inv.id === id);
  if (active) {
    return active;
  }
  if (role === 'admin') {
    return scoped.includingDeleted().find((inv) => inv.id === id) ?? null;
  }
  return null;
};
