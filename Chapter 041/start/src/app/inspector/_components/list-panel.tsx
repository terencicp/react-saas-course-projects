import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import type { Cursor } from '@/db/cursor';
import { listInvoices } from '@/lib/invoices/queries';
import type { InvoiceStatus } from '@/lib/invoices/schema';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

// Formatting a stored Date is not a clock read, so it is safe under
// cacheComponents (no new Date()/Date.now() in render).
const date = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const STATUS_VARIANT: Record<
  InvoiceStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'outline',
  sent: 'secondary',
  paid: 'default',
  overdue: 'destructive',
};

type ListPanelProps = {
  organizationId: string;
  status: InvoiceStatus | undefined;
  cursor: Cursor | undefined;
};

// Query-string variations of the declared /inspector route. The template-literal
// return type keeps these assignable to typedRoutes' Route union.
const nextPageHref = (
  organizationId: string,
  status: InvoiceStatus | undefined,
  nextCursor: string,
): `/inspector?${string}` => {
  const params = new URLSearchParams({ orgId: organizationId });
  if (status) params.set('status', status);
  params.set('cursor', nextCursor);
  return `/inspector?${params.toString()}`;
};

const detailHref = (
  organizationId: string,
  invoiceId: string,
): `/inspector?${string}` => {
  const params = new URLSearchParams({ orgId: organizationId, invoiceId });
  return `/inspector?${params.toString()}`;
};

export const ListPanel = async ({
  organizationId,
  status,
  cursor,
}: ListPanelProps) => {
  const { rows, nextCursor } = await listInvoices({
    organizationId,
    status,
    cursor,
    pageSize: 20,
  });

  return (
    <section
      data-testid="list-panel"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-medium text-muted-foreground">Invoices</h2>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No invoices for this filter.
        </p>
      ) : (
        <ul data-testid="invoices-list" className="flex flex-col gap-2">
          {rows.map((invoice) => {
            const invoiceStatus = invoice.status as InvoiceStatus;
            return (
              <li key={invoice.id}>
                <Link
                  href={detailHref(organizationId, invoice.id)}
                  className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium text-card-foreground">
                      {invoice.number}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {invoice.customer.name}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <Badge variant={STATUS_VARIANT[invoiceStatus]}>
                      {invoice.status}
                    </Badge>
                    <span className="tabular-nums text-card-foreground">
                      {currency.format(Number(invoice.total))}
                    </span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {date.format(invoice.dueAt)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="pt-2">
        {nextCursor ? (
          <Link
            data-testid="next-page-link"
            href={nextPageHref(organizationId, status, nextCursor)}
            className="inline-flex rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Next page
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">End of list</span>
        )}
      </footer>
    </section>
  );
};
