import type { Route } from 'next';
import Link from 'next/link';

import { listInvoices } from '@/db/queries/invoices';
import { requireOrgUser } from '@/lib/auth';

// The invoices list. Request-time reads (requireOrgUser + listInvoices) → ships a
// loading.tsx. Each row links to the detail route the audit reads against.
const InvoicesPage = async () => {
  const { orgId } = await requireOrgUser();
  const { rows } = await listInvoices({
    orgId,
    view: 'active',
    cursor: null,
    pageSize: 25,
  });

  return (
    <section
      data-testid="invoices-page"
      className="mx-auto max-w-3xl px-6 py-16"
    >
      <h1 className="text-2xl font-semibold">Invoices</h1>
      <ul className="mt-6 divide-y">
        {rows.map((invoice) => (
          <li key={invoice.id} className="py-3">
            <Link
              href={`/invoices/${invoice.id}` as Route}
              className="flex items-center justify-between text-sm hover:underline"
            >
              <span className="font-medium">{invoice.number}</span>
              <span className="text-muted-foreground">
                {invoice.customerName}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default InvoicesPage;
