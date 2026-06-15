import { notFound } from 'next/navigation';
import { EditForm } from '@/app/(app)/invoices/[id]/edit/edit-form';
import { FetchedAtStrip } from '@/app/(app)/invoices/fetched-at-strip';
import { getInvoiceDetail } from '@/lib/invoices/queries';
import { getSession } from '@/server/session';

type EditPageProps = {
  params: Promise<{ id: string }>;
};

const EditInvoicePage = async ({ params }: EditPageProps) => {
  const { id } = await params;
  const session = await getSession();

  const invoice = await getInvoiceDetail({
    orgId: session.orgId,
    id,
    role: session.role,
  });

  if (!invoice) {
    notFound();
  }

  // Split the cache-state field off the row the form edits, so `<EditForm />`
  // keeps its plain `Invoice` contract.
  const { fetchedAt, ...row } = invoice;

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">Edit {row.number}</h1>
      <FetchedAtStrip detailFetchedAt={fetchedAt} />
      <EditForm invoice={row} role={session.role} />
    </div>
  );
};

export default EditInvoicePage;
