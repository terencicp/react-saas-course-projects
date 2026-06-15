'use client';

// TODO(L4) — useActionState(deleteInvoice, null); shadcn Dialog (trigger + body form action with hidden id + Cancel + destructive SubmitButton); inline no-JS fallback form.

import { Button } from '@/components/ui/button';

type DeleteInvoiceFormProps = {
  invoiceId: string;
  invoiceNumber: string;
};

export const DeleteInvoiceForm = (_props: DeleteInvoiceFormProps) => {
  return (
    <section data-testid="delete-invoice-form" className="flex flex-col gap-2">
      <Button type="button" variant="destructive" data-testid="delete-trigger">
        Delete
      </Button>
    </section>
  );
};
