import { notFound } from 'next/navigation';
import { EditForm } from '@/app/(app)/invoices/[id]/edit/edit-form';
import { getInvoiceDetail } from '@/lib/invoices/queries';
import { getSession } from '@/server/session';

type EditPageProps = {
  params: Promise<{ id: string }>;
};

const EditInvoicePage = async ({ params }: EditPageProps) => {
  const { id } = await params;
  const session = await getSession();

  const invoice = getInvoiceDetail({
    orgId: session.orgId,
    id,
    role: session.role,
  });

  if (!invoice) {
    notFound();
  }

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">Edit {invoice.number}</h1>
      <EditForm invoice={invoice} role={session.role} />
    </div>
  );
};

export default EditInvoicePage;
