'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { createContext, use, useOptimistic } from 'react';

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
// its append reaches this same-page list. `inline` flags whether a provider is
// present: the default is a safe no-op with `inline: false`, so when the form
// renders standalone at /invoices/new it skips the optimistic append (and owns
// no <h2>, letting the page own the <h1>) and the action redirects on success.
type AddOptimisticInvoiceContextValue = {
  addOptimistic: (invoice: OptimisticInvoice) => void;
  inline: boolean;
};

const AddOptimisticInvoiceContext =
  createContext<AddOptimisticInvoiceContextValue>({
    addOptimistic: () => {},
    inline: false,
  });

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
  const [optimisticInvoices, addOptimistic] = useOptimistic<
    ListItem[],
    OptimisticInvoice
  >(initialInvoices, (current, next) => [next, ...current]);

  return (
    <AddOptimisticInvoiceContext value={{ addOptimistic, inline: true }}>
      <div className="flex flex-col gap-6">
        <NewInvoiceForm customers={customers} />

        {optimisticInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <ul data-testid="invoices-list" className="flex flex-col gap-2">
            {optimisticInvoices.map((invoice) =>
              'pending' in invoice ? (
                <li key={invoice.id}>
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-3 text-sm opacity-60">
                    <span className="flex items-center gap-2 font-medium text-card-foreground">
                      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                      {invoice.number}
                    </span>
                    <span className="text-muted-foreground">
                      {invoice.customerName}
                    </span>
                    <span className="text-muted-foreground">
                      {invoice.status}
                    </span>
                    <span className="tabular-nums text-card-foreground">
                      {currency.format(Number(invoice.total))}
                    </span>
                    <span className="text-muted-foreground">
                      {invoice.dueAt ? date.format(invoice.dueAt) : '—'}
                    </span>
                  </div>
                </li>
              ) : (
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
                    <span className="text-muted-foreground">
                      {invoice.status}
                    </span>
                    <span className="tabular-nums text-card-foreground">
                      {currency.format(Number(invoice.total))}
                    </span>
                    <span className="text-muted-foreground">
                      {date.format(invoice.dueAt)}
                    </span>
                  </Link>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </AddOptimisticInvoiceContext>
  );
};
