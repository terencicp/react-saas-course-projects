import { InvoiceForm } from '@/components/invoice-form';
import { NewInvoiceDialog } from '@/components/new-invoice-dialog';

const InterceptedNewPage = () => (
  <NewInvoiceDialog>
    <InvoiceForm />
  </NewInvoiceDialog>
);

export default InterceptedNewPage;
