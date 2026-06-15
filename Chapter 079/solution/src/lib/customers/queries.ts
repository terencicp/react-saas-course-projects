import 'server-only';

import { customers } from '@/server/store';
import type { Customer } from '@/server/types';

// Server-only reads over the in-memory store, always scoped by `orgId` (the
// tenant boundary). The wizard writes through `pushCustomer`; these back the
// customers list and the read-only detail page.

export type ListCustomersArgs = {
  orgId: string;
  q?: string;
  cursor?: string | null;
  pageSize?: number;
};

export type ListCustomersResult = {
  rows: Customer[];
  nextCursor: string | null;
};

export const listCustomers = ({
  orgId,
  q = '',
  cursor = null,
  pageSize = 20,
}: ListCustomersArgs): ListCustomersResult => {
  const needle = q.trim().toLowerCase();

  const scoped = customers
    .filter((c) => c.orgId === orgId)
    .filter((c) =>
      needle
        ? `${c.firstName} ${c.lastName}`.toLowerCase().includes(needle) ||
          c.email.toLowerCase().includes(needle)
        : true,
    )
    // Newest first by `createdAt`, then id as a stable tiebreaker.
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    );

  const start = cursor ? scoped.findIndex((c) => c.id === cursor) + 1 : 0;
  const page = scoped.slice(start, start + pageSize);
  const hasMore = scoped.length > start + pageSize;
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

  return { rows: page, nextCursor };
};

export type GetCustomerDetailArgs = {
  orgId: string;
  id: string;
};

export const getCustomerDetail = ({
  orgId,
  id,
}: GetCustomerDetailArgs): Customer | null =>
  customers.find((c) => c.orgId === orgId && c.id === id) ?? null;
