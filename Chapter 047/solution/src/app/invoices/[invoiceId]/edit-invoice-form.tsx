'use client';

import { useActionState, useState } from 'react';

import { FieldError } from '@/app/_components/field-error';
import { SubmitButton } from '@/app/_components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { updateInvoice } from '@/lib/invoices/actions';
import type { InvoiceDetail } from '@/lib/invoices/queries';
import { statusSchema } from '@/lib/invoices/schema';

type EditInvoiceFormProps = {
  invoice: InvoiceDetail;
  customers: { id: string; name: string }[];
};

const dateInputFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'UTC',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// The fields whose typed values are echoed back as defaultValue on a failed
// submit. A `<form action={fn}>` fires requestFormReset on commit under
// react-dom 19, so an invalid edit would otherwise revert the inputs to the
// invoice prop's values; remounting the field cluster on each submit re-applies
// these as the initial uncontrolled values, keeping what the user typed.
const echoedFields = [
  'customerId',
  'number',
  'status',
  'total',
  'issuedAt',
  'dueAt',
  'currency',
] as const;

export const EditInvoiceForm = ({
  invoice,
  customers,
}: EditInvoiceFormProps) => {
  const [state, formAction] = useActionState(updateInvoice, null);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  const [defaults, setDefaults] = useState<
    Record<(typeof echoedFields)[number], string>
  >({
    customerId: invoice.customerId,
    number: invoice.number,
    status: invoice.status,
    total: String(invoice.total),
    issuedAt: dateInputFormat.format(invoice.issuedAt),
    dueAt: dateInputFormat.format(invoice.dueAt),
    currency: invoice.currency,
  });
  const [submitCount, setSubmitCount] = useState(0);

  const handleSubmit = (formData: FormData) => {
    setDefaults(
      Object.fromEntries(
        echoedFields.map((field) => [field, String(formData.get(field) ?? '')]),
      ) as Record<(typeof echoedFields)[number], string>,
    );
    setSubmitCount((count) => count + 1);
    formAction(formData);
  };

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Edit invoice</h2>
      <form
        key={submitCount}
        action={handleSubmit}
        data-testid="edit-invoice-form"
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="id" defaultValue={invoice.id} />

        <div className="grid gap-2">
          <Label htmlFor="customerId">Customer</Label>
          <NativeSelect
            id="customerId"
            name="customerId"
            defaultValue={defaults.customerId}
            aria-describedby="customerId-error"
            aria-invalid={!!fieldErrors?.customerId?.[0]}
          >
            <NativeSelectOption value="">Select a customer</NativeSelectOption>
            {customers.map((customer) => (
              <NativeSelectOption key={customer.id} value={customer.id}>
                {customer.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError name="customerId" fieldErrors={fieldErrors} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="number">Number</Label>
          <Input
            id="number"
            name="number"
            type="text"
            required
            autoComplete="off"
            defaultValue={defaults.number}
            aria-describedby="number-error"
            aria-invalid={!!fieldErrors?.number?.[0]}
          />
          <FieldError name="number" fieldErrors={fieldErrors} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="status">Status</Label>
          <NativeSelect
            id="status"
            name="status"
            defaultValue={defaults.status}
            aria-describedby="status-error"
            aria-invalid={!!fieldErrors?.status?.[0]}
          >
            {statusSchema.options.map((status) => (
              <NativeSelectOption key={status} value={status}>
                {status}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError name="status" fieldErrors={fieldErrors} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="total">Total</Label>
          <Input
            id="total"
            name="total"
            type="number"
            step="0.01"
            min="0"
            required
            inputMode="decimal"
            defaultValue={defaults.total}
            aria-describedby="total-error"
            aria-invalid={!!fieldErrors?.total?.[0]}
          />
          <FieldError name="total" fieldErrors={fieldErrors} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="issuedAt">Issued</Label>
          <Input
            id="issuedAt"
            name="issuedAt"
            type="date"
            required
            defaultValue={defaults.issuedAt}
            aria-describedby="issuedAt-error"
            aria-invalid={!!fieldErrors?.issuedAt?.[0]}
          />
          <FieldError name="issuedAt" fieldErrors={fieldErrors} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="dueAt">Due</Label>
          <Input
            id="dueAt"
            name="dueAt"
            type="date"
            required
            defaultValue={defaults.dueAt}
            aria-describedby="dueAt-error"
            aria-invalid={!!fieldErrors?.dueAt?.[0]}
          />
          <FieldError name="dueAt" fieldErrors={fieldErrors} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            name="currency"
            type="text"
            defaultValue={defaults.currency}
            aria-describedby="currency-error"
            aria-invalid={!!fieldErrors?.currency?.[0]}
          />
          <FieldError name="currency" fieldErrors={fieldErrors} />
        </div>

        {state?.ok === false && state.error.code !== 'validation' && (
          <p role="alert" className="text-destructive">
            {state.error.userMessage}
          </p>
        )}

        <SubmitButton>Save changes</SubmitButton>
      </form>
    </section>
  );
};
