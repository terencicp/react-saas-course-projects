import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getInvoiceDetail } from '@/lib/invoices/queries';
import type { InvoiceStatus } from '@/lib/invoices/schema';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const date = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

type DetailPanelProps = {
  organizationId: string;
  invoiceId: string | undefined;
};

const EmptyState = () => (
  <p
    data-testid="detail-empty"
    className="py-8 text-center text-sm text-muted-foreground"
  >
    Pick an invoice to see its details.
  </p>
);

export const DetailPanel = async ({
  organizationId,
  invoiceId,
}: DetailPanelProps) => {
  const invoice = invoiceId
    ? await getInvoiceDetail({ organizationId, invoiceId })
    : null;

  return (
    <section
      data-testid="detail-panel"
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-medium text-muted-foreground">Detail</h2>

      {invoice === null ? (
        <EmptyState />
      ) : (
        <article data-testid="invoice-detail" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-lg font-semibold text-card-foreground">
              {invoice.number}
            </span>
            <Badge>{invoice.status as InvoiceStatus}</Badge>
          </div>

          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Customer</dt>
            <dd className="text-card-foreground">{invoice.customer.name}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="text-card-foreground">{invoice.customer.email}</dd>
            <dt className="text-muted-foreground">Issued</dt>
            <dd className="text-card-foreground">
              {date.format(invoice.issuedAt)}
            </dd>
            <dt className="text-muted-foreground">Due</dt>
            <dd className="text-card-foreground">
              {date.format(invoice.dueAt)}
            </dd>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-medium tabular-nums text-card-foreground">
              {currency.format(Number(invoice.total))}
            </dd>
          </dl>

          <Separator />

          <ul className="flex flex-col gap-2">
            {invoice.lines.map((line) => (
              <li
                key={line.id}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <span className="text-card-foreground">
                  {line.position}. {line.description}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {line.quantity} × {currency.format(Number(line.unitPrice))}
                </span>
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  );
};
