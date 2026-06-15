import { notFound } from 'next/navigation';

import { InvoiceDetail } from '@/components/invoice-detail';
import { getInvoice } from '@/lib/invoices/queries';

const DetailPage = async ({ params }: PageProps<'/invoices/[id]'>) => {
  const { id } = await params;
  const invoice = await getInvoice(id);

  if (!invoice) {
    notFound();
  }

  return <InvoiceDetail invoice={invoice} />;
};

export default DetailPage;
