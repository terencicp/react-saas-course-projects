'use client';

// TODO(L5) — useOptimistic(initialInvoices, (c, next) => [next, ...c]); render rows keyed by id, pending row dimmed+spinner; expose addOptimisticInvoice via context.

import Link from 'next/link';
import { createContext, use } from 'react';

import { NewInvoiceForm } from '@/app/invoices/new/new-invoice-form';
import type { InvoiceListRow } from '@/lib/invoices/queries';
import type { InvoiceStatus } from '@/lib/invoices/schema';

// The display-subset an optimistic frame can supply before the joined row lands
// (customerName/dueAt are placeholders the revalidated row replaces). It is NOT
// `InvoiceListRow & { pending }` — the full joined row carries fields an
// optimistic frame cannot.
export type OptimisticInvoice = {
  id: string;
  number: string;
  status: InvoiceStatus;
  total: string;
  customerName: string;
  dueAt: Date | null;
  pending: true;
};

export type ListItem = InvoiceListRow | OptimisticInvoice;

// The optimistic appender, shared with the inline NewInvoiceForm via context so
// its append reaches this same-page list. The default is a safe no-op: when the
// form renders standalone at /invoices/new (no provider), the append simply does
// nothing and the action redirects on success.
const AddOptimisticInvoiceContext = createContext<
  (invoice: OptimisticInvoice) => void
>(() => {});

export const useAddOptimisticInvoice = () => use(AddOptimisticInvoiceContext);

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const date = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

type OptimisticInvoicesListProps = {
  initialInvoices: InvoiceListRow[];
  customers: { id: string; name: string }[];
};

export const OptimisticInvoicesList = ({
  initialInvoices,
  customers,
}: OptimisticInvoicesListProps) => {
  return (
    <div className="flex flex-col gap-6">
      <NewInvoiceForm customers={customers} />

      {initialInvoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices yet.</p>
      ) : (
        <ul data-testid="invoices-list" className="flex flex-col gap-2">
          {initialInvoices.map((invoice) => (
            <li key={invoice.id}>
              <Link
                href={`/invoices/${invoice.id}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-3 text-sm hover:bg-accent"
              >
                <span className="font-medium text-card-foreground">
                  {invoice.number}
                </span>
                <span className="text-muted-foreground">
                  {invoice.customer.name}
                </span>
                <span className="text-muted-foreground">{invoice.status}</span>
                <span className="tabular-nums text-card-foreground">
                  {currency.format(Number(invoice.total))}
                </span>
                <span className="text-muted-foreground">
                  {date.format(invoice.dueAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
