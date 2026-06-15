'use client';

import { debounce, useQueryStates } from 'nuqs';
import { useDeferredValue, useEffect, useState, useTransition } from 'react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  InvoiceSort,
  InvoiceStatus,
  ListParsed,
} from '@/lib/invoices/queries';
import { invoiceListSearchParams } from '@/lib/invoices/search-params';

export const Toolbar = ({ parsed }: { parsed: ListParsed }) => {
  const [, setQueryStates] = useQueryStates(invoiceListSearchParams, {
    shallow: false,
    limitUrlUpdates: debounce(300),
  });

  const [q, setQ] = useState(parsed.q);
  const deferredQ = useDeferredValue(q);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (deferredQ === parsed.q) {
      return;
    }
    startTransition(() => {
      setQueryStates({ q: deferredQ || null, cursor: null });
    });
  }, [deferredQ, parsed.q, setQueryStates]);

  return (
    <div
      data-testid="toolbar"
      className="flex flex-wrap items-center gap-2 rounded-lg border p-2"
    >
      <Select
        value={parsed.status ?? 'all'}
        onValueChange={(value) =>
          setQueryStates({
            status: value === 'all' ? null : (value as InvoiceStatus),
            cursor: null,
          })
        }
      >
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
        value={parsed.sort}
        onValueChange={(value) =>
          setQueryStates({ sort: value as InvoiceSort, cursor: null })
        }
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
