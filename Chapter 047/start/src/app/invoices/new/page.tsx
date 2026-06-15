import { NewInvoiceForm } from '@/app/invoices/new/new-invoice-form';
import { listCustomers } from '@/db/queries/invoices';
import { getActiveContext } from '@/lib/auth-stub';

const NewInvoicePage = async () => {
  const { organizationId } = await getActiveContext();
  const customers = await listCustomers(organizationId);

  return (
    <main
      data-testid="new-invoice-page"
      className="mx-auto flex max-w-2xl flex-col gap-6 p-6"
    >
      {/* The page owns the single <h1>. The form suppresses its own <h2> when
          rendered standalone (no optimistic provider), so there is no duplicate
          heading. Rendered outside any optimistic context, addOptimisticInvoice
          resolves to its safe no-op default and the form just submits and
          redirects. */}
      <h1 className="text-2xl font-semibold">New invoice</h1>
      <NewInvoiceForm customers={customers} />
    </main>
  );
};

export default NewInvoicePage;
