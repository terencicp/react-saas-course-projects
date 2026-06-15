import { notFound } from 'next/navigation';

import { InvoiceNotes } from '@/app/(protected)/invoices/[id]/notes';
import { getInvoiceWithNotes } from '@/db/queries/invoice-notes';
import { requireOrgUser } from '@/lib/auth';

// The invoice detail surface: header + the user-submitted notes region. The notes
// region renders finding 2's seeded XSS sink (notes.tsx). Request-time reads → ships
// a loading.tsx.
const InvoiceDetailPage = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  const { id } = await params;
  const { orgId } = await requireOrgUser();
  const result = await getInvoiceWithNotes(orgId, id);
  if (!result) {
    notFound();
  }

  return (
    <section
      data-testid="invoice-detail-page"
      className="mx-auto max-w-2xl px-6 py-16"
    >
      <h1 className="text-2xl font-semibold">{result.invoice.number}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {result.invoice.customerName}
      </p>

      <h2 className="mt-8 text-lg font-medium">Notes</h2>
      <div className="mt-3">
        <InvoiceNotes notes={result.notes} />
      </div>
    </section>
  );
};

export default InvoiceDetailPage;
