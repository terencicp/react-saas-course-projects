import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { Invoice } from '@/lib/invoices/schema';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export const InvoiceDetail = ({ invoice }: { invoice: Invoice }) => (
  <article data-testid="invoice-detail" className="flex flex-col gap-4 p-6">
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">
        {invoice.number}
      </h1>
      <p className="text-sm text-muted-foreground">{invoice.customer}</p>
    </header>

    <Separator />

    <dl className="grid grid-cols-[8rem_1fr] gap-y-3 text-sm">
      <dt className="text-muted-foreground">Status</dt>
      <dd>
        <Badge variant="outline">{invoice.status}</Badge>
      </dd>

      <dt className="text-muted-foreground">Amount</dt>
      <dd className="tabular-nums">{currency.format(invoice.amount / 100)}</dd>

      <dt className="text-muted-foreground">Due date</dt>
      <dd className="tabular-nums">{invoice.dueDate}</dd>
    </dl>
  </article>
);
