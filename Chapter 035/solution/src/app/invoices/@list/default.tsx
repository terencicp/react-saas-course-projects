import Link from 'next/link';

import { InvoiceList } from '@/components/invoice-list';
import { StatusFilter } from '@/components/status-filter';
import { Button } from '@/components/ui/button';
import { listInvoices } from '@/lib/invoices/queries';

const ListDefault = async () => {
  const invoices = await listInvoices({});

  return (
    <section className="flex flex-col border-border border-e">
      <header className="flex items-center justify-between gap-2 p-2">
        <span className="px-1 text-sm font-semibold">Invoices</span>
        <Button asChild size="sm">
          <Link href="/invoices/new" data-testid="new-invoice-link">
            New invoice
          </Link>
        </Button>
      </header>
      <StatusFilter />
      <InvoiceList invoices={invoices} />
    </section>
  );
};

export default ListDefault;
