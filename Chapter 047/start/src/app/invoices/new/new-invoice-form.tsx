'use client';

// TODO(L2) — useActionState(createInvoice, null); native <form action>; field cluster per field (customer/number/status/total/issuedAt/dueAt/currency) with Label+control+FieldError, aria-*; banner; <SubmitButton>. (L5 adds tempId uuidv7 hidden input + optimistic startTransition + _debug_fail checkbox.)

type NewInvoiceFormProps = {
  customers: { id: string; name: string }[];
};

export const NewInvoiceForm = (_props: NewInvoiceFormProps) => {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">New invoice</h2>
      <form data-testid="new-invoice-form" className="flex flex-col gap-4" />
    </section>
  );
};
