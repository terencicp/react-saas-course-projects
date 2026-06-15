import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DeleteInvoiceForm } from '@/app/invoices/[invoiceId]/delete-invoice-form';
import { EditInvoiceForm } from '@/app/invoices/[invoiceId]/edit-invoice-form';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { listCustomers } from '@/db/queries/invoices';
import { getActiveContext } from '@/lib/auth-stub';
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

const InvoiceDetailPage = async ({
  params,
}: PageProps<'/invoices/[invoiceId]'>) => {
  const { invoiceId } = await params;
  const { organizationId } = await getActiveContext();

  const invoice = await getInvoiceDetail({ organizationId, invoiceId });
  if (invoice === null) {
    notFound();
  }

  const customers = await listCustomers(organizationId);

  return (
    <main
      data-testid="invoice-detail-page"
      className="mx-auto flex max-w-2xl flex-col gap-6 p-6"
    >
      <Link
        href="/invoices"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Back to invoices
      </Link>

      {/* Read-only detail panel (inline render of the getInvoiceDetail result). */}
      <article
        data-testid="invoice-detail"
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      >
        <div className="flex items-center justify-between gap-4">
          {/* The invoice number is the page's single <h1>. */}
          <h1 className="text-lg font-semibold text-card-foreground">
            {invoice.number}
          </h1>
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
          <dd className="text-card-foreground">{date.format(invoice.dueAt)}</dd>
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

      <EditInvoiceForm invoice={invoice} customers={customers} />

      <DeleteInvoiceForm
        invoiceId={invoice.id}
        invoiceNumber={invoice.number}
      />
    </main>
  );
};

export default InvoiceDetailPage;
