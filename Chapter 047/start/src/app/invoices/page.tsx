import Link from 'next/link';

import { DeletedToast } from '@/app/invoices/_components/deleted-toast';
import { OptimisticInvoicesList } from '@/app/invoices/_components/optimistic-invoices-list';
import { Button } from '@/components/ui/button';
import { listCustomers } from '@/db/queries/invoices';
import { getActiveContext } from '@/lib/auth-stub';
import { listInvoices } from '@/lib/invoices/queries';

const InvoicesPage = async ({ searchParams }: PageProps<'/invoices'>) => {
  const params = await searchParams;
  const deleted =
    typeof params.deleted === 'string' ? params.deleted : undefined;

  const { organizationId } = await getActiveContext();

  const { rows } = await listInvoices({
    organizationId,
    status: undefined,
    cursor: undefined,
    pageSize: 20,
  });
  const customers = await listCustomers(organizationId);

  return (
    <main
      data-testid="invoices-page"
      className="mx-auto flex max-w-4xl flex-col gap-6 p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <Button asChild>
          <Link href="/invoices/new" data-testid="new-invoice-link">
            New invoice
          </Link>
        </Button>
      </div>

      {deleted ? (
        <>
          {/* SSR success banner — survives no-JS (it's text from searchParams). */}
          <p
            role="status"
            data-testid="deleted-banner"
            className="rounded-md border border-border bg-card p-3 text-sm text-card-foreground"
          >
            Invoice {deleted} deleted
          </p>
          {/* JS-enhanced toast island. */}
          <DeletedToast number={deleted} />
        </>
      ) : null}

      <OptimisticInvoicesList initialInvoices={rows} customers={customers} />
    </main>
  );
};

export default InvoicesPage;
