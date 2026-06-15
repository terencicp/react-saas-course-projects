'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { InvoiceSort, ListParsed } from '@/lib/invoices/queries';

// TODO(L2) — lift filter/sort/search/view into the URL via useQueryStates.
//
// This baseline holds filter/sort/search state in local `useState`, so the
// controls render but never write the URL: a refresh or a shared link loses the
// view. Replace local state with `useQueryStates(invoiceListSearchParams, {
// shallow: false, limitUrlUpdates: debounce(300) })`, bundle `cursor: null` on
// every setter call, and keep the search input responsive by syncing only its
// deferred value to the URL.
export const Toolbar = ({ parsed }: { parsed: ListParsed }) => {
  const [status, setStatus] = useState<string>(parsed.status ?? 'all');
  const [sort, setSort] = useState<InvoiceSort>(parsed.sort);
  const [q, setQ] = useState(parsed.q);

  return (
    <div
      data-testid="toolbar"
      className="flex flex-wrap items-center gap-2 rounded-lg border p-2"
    >
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger data-testid="filter-status" className="w-36">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="sent">Sent</SelectItem>
          <SelectItem value="paid">Paid</SelectItem>
          <SelectItem value="overdue">Overdue</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={sort}
        onValueChange={(value) => setSort(value as InvoiceSort)}
      >
        <SelectTrigger data-testid="filter-sort" className="w-44">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="-createdAt">Newest first</SelectItem>
          <SelectItem value="createdAt">Oldest first</SelectItem>
          <SelectItem value="-total">Total: high to low</SelectItem>
          <SelectItem value="total">Total: low to high</SelectItem>
          <SelectItem value="-customer">Customer: Z–A</SelectItem>
          <SelectItem value="customer">Customer: A–Z</SelectItem>
        </SelectContent>
      </Select>

      <Input
        data-testid="search-input"
        type="search"
        placeholder="Search…"
        className="w-56"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
    </div>
  );
};
