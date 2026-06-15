'use client';

// TODO(L3) — useActionState(updateInvoice, null); mirror NewInvoiceForm with defaultValue from invoice prop + hidden id input.

import type { InvoiceDetail } from '@/lib/invoices/queries';

type EditInvoiceFormProps = {
  invoice: InvoiceDetail;
  customers: { id: string; name: string }[];
};

export const EditInvoiceForm = (_props: EditInvoiceFormProps) => {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Edit invoice</h2>
      <form data-testid="edit-invoice-form" className="flex flex-col gap-4" />
    </section>
  );
};
