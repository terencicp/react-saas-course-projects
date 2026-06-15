import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import type { Invoice } from '@/lib/invoices/schema';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export const InvoiceList = ({ invoices }: { invoices: Invoice[] }) => {
  if (invoices.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">No invoices</p>
    );
  }

  return (
    <ul data-testid="invoices-list" className="flex flex-col gap-1 p-2">
      {invoices.map((invoice) => (
        <li key={invoice.id}>
          <Link
            href={`/invoices/${invoice.id}`}
            className="flex items-center justify-between gap-3 rounded-md px-3 py-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{invoice.number}</span>
              <span className="text-xs text-muted-foreground">
                {invoice.customer}
              </span>
            </span>
            <span className="flex items-center gap-3">
              <Badge variant="outline">{invoice.status}</Badge>
              <span className="text-sm tabular-nums">
                {currency.format(invoice.amount / 100)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
};
