import 'server-only';

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';

import { db } from '@/db';
import { invoices } from '@/db/schema';
import type { Role } from '@/lib/auth/roles';
import { scopedInvoices } from '@/lib/invoices/scoped-query';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export type InvoiceSort =
  | '-createdAt'
  | 'createdAt'
  | '-total'
  | 'total'
  | '-customer'
  | 'customer';

export type InvoiceView = 'active' | 'archived' | 'all';

// The settled view-state slice the page reads from the URL and threads into the
// toolbar, chips, and view tabs.
export type ListParsed = {
  status: InvoiceStatus | null;
  sort: InvoiceSort;
  view: InvoiceView;
  q: string;
  cursor: string | null;
};

// The row shape the list/detail return. The contract dropped `total`; the new
// pair is read directly from the now-NOT-NULL columns. Any surface needing the
// combined amount derives subtotal + tax at the app layer.
export type InvoiceRow = {
  id: string;
  organizationId: string;
  number: string;
  customerName: string;
  status: InvoiceStatus;
  subtotal: string;
  tax: string;
  currency: string;
  createdAt: Date;
  dueAt: Date | null;
  deletedAt: Date | null;
  archivedAt: Date | null;
  version: number;
};

// The combined-amount sort expression, derived from the pair (no `total` column
// to order by anymore). Drizzle 0.45 ships no money helpers, so it is a sql
// template over the two columns.
const amountExpr = sql`(${invoices.subtotal} + ${invoices.tax})`;

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
  rows: InvoiceRow[];
  nextCursor: string | null;
  hasPrev: boolean;
};

// The read-layer RBAC gate: `all` collapses to `active` for non-admins, so a
// member hand-typing `?view=all` is served active rows regardless of the URL.
const resolveView = (view: InvoiceView, role: Role): InvoiceView =>
  view === 'all' && role !== 'admin' ? 'active' : view;

const viewFilter = (orgId: string, view: InvoiceView): SQL => {
  const scoped = scopedInvoices(orgId);
  if (view === 'archived') {
    return scoped.archived();
  }
  if (view === 'all') {
    return scoped.includingDeleted();
  }
  return scoped.active();
};

const orderBy = (sort: InvoiceSort) => {
  switch (sort) {
    case 'createdAt':
      return [asc(invoices.createdAt), asc(invoices.id)];
    case '-createdAt':
      return [desc(invoices.createdAt), desc(invoices.id)];
    case 'total':
      return [asc(amountExpr), asc(invoices.id)];
    case '-total':
      return [desc(amountExpr), desc(invoices.id)];
    case 'customer':
      return [asc(invoices.customerName), asc(invoices.id)];
    case '-customer':
      return [desc(invoices.customerName), desc(invoices.id)];
  }
};

// Keyset cursor on the row id: a simple, stable "rows after this id" predicate.
// The default newest-first sort pages descending on id (uuidv7 is time-ordered),
// matching the createdAt order closely enough for the carried-in surface.
const cursorFilter = (
  sort: InvoiceSort,
  cursor: string | null,
): SQL | undefined => {
  if (!cursor) {
    return undefined;
  }
  const ascending =
    sort === 'createdAt' || sort === 'total' || sort === 'customer';
  return ascending
    ? (sql`${invoices.id} > ${cursor}` as SQL)
    : (lt(invoices.id, cursor) as SQL);
};

export const listInvoices = async ({
  orgId,
  view,
  status,
  sort,
  q,
  cursor,
  role,
  pageSize = 20,
}: ListInvoicesArgs): Promise<ListInvoicesResult> => {
  const resolved = resolveView(view, role);
  const needle = q.trim();

  const where = and(
    viewFilter(orgId, resolved),
    status ? sql`${invoices.status} = ${status}` : undefined,
    needle
      ? or(
          ilike(invoices.customerName, `%${needle}%`),
          ilike(invoices.number, `%${needle}%`),
        )
      : undefined,
    cursorFilter(sort, cursor),
  );

  const found = await db
    .select({
      id: invoices.id,
      organizationId: invoices.organizationId,
      number: invoices.number,
      customerName: invoices.customerName,
      status: invoices.status,
      subtotal: invoices.subtotal,
      tax: invoices.tax,
      currency: invoices.currency,
      createdAt: invoices.createdAt,
      dueAt: invoices.dueAt,
      deletedAt: invoices.deletedAt,
      archivedAt: invoices.archivedAt,
      version: invoices.version,
    })
    .from(invoices)
    .where(where)
    .orderBy(...orderBy(sort))
    .limit(pageSize + 1);

  const rows = found.slice(0, pageSize) as InvoiceRow[];
  const nextCursor =
    found.length > pageSize ? (rows[rows.length - 1]?.id ?? null) : null;

  return { rows, nextCursor, hasPrev: cursor !== null };
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
}: GetInvoiceDetailArgs): Promise<InvoiceRow | null> => {
  // Active + archived rows load for everyone (archived so the row can be
  // restored); a soft-deleted row only loads for an admin.
  const scoped = scopedInvoices(orgId);
  const visible: SQL =
    role === 'admin'
      ? scoped.includingDeleted()
      : (and(scoped.includingDeleted(), isNull(invoices.deletedAt)) as SQL);
  const where = and(visible, eq(invoices.id, id));

  const found = await db
    .select({
      id: invoices.id,
      organizationId: invoices.organizationId,
      number: invoices.number,
      customerName: invoices.customerName,
      status: invoices.status,
      subtotal: invoices.subtotal,
      tax: invoices.tax,
      currency: invoices.currency,
      createdAt: invoices.createdAt,
      dueAt: invoices.dueAt,
      deletedAt: invoices.deletedAt,
      archivedAt: invoices.archivedAt,
      version: invoices.version,
    })
    .from(invoices)
    .where(where)
    .limit(1);

  return (found[0] as InvoiceRow | undefined) ?? null;
};
