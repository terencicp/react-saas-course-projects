import { notFound } from 'next/navigation';

import { EditForm } from '@/app/(protected)/invoices/[id]/edit/edit-form';
import { requireOrgUser } from '@/lib/auth';
import { getInvoiceDetail } from '@/lib/invoices/queries';

type EditPageProps = {
  params: Promise<{ id: string }>;
};

const EditInvoicePage = async ({ params }: EditPageProps) => {
  const { id } = await params;
  const { orgId, role } = await requireOrgUser();

  const invoice = await getInvoiceDetail({ orgId, id, role });

  if (!invoice) {
    notFound();
  }

  return (
    <div className="max-w-lg space-y-4 px-6 py-10">
      <h1 className="text-xl font-semibold">Edit {invoice.number}</h1>
      <EditForm invoice={invoice} role={role} />
    </div>
  );
};

export default EditInvoicePage;
