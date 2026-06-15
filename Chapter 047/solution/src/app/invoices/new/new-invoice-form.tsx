'use client';

import { startTransition, useActionState, useState } from 'react';
import { uuidv7 } from 'uuidv7';

import { FieldError } from '@/app/_components/field-error';
import { SubmitButton } from '@/app/_components/submit-button';
import { useAddOptimisticInvoice } from '@/app/invoices/_components/optimistic-invoices-list';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { createInvoice } from '@/lib/invoices/actions';
import { type InvoiceStatus, statusSchema } from '@/lib/invoices/schema';

type NewInvoiceFormProps = {
  customers: { id: string; name: string }[];
};

// The fields whose typed values are echoed back as defaultValue on a failed
// submit. A `<form action={fn}>` fires requestFormReset on commit under
// react-dom 19, so a forced-failure rollback would otherwise blank the inputs;
// remounting the field cluster on each submit re-applies these as the initial
// uncontrolled values.
const echoedFields = [
  'customerId',
  'number',
  'status',
  'total',
  'issuedAt',
  'dueAt',
  'currency',
] as const;

const initialDefaults: Record<(typeof echoedFields)[number], string> = {
  customerId: '',
  number: '',
  status: 'draft',
  total: '',
  issuedAt: '',
  dueAt: '',
  currency: 'USD',
};

export const NewInvoiceForm = ({ customers }: NewInvoiceFormProps) => {
  const [state, formAction] = useActionState(createInvoice, null);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  // `inline` is true only when rendered inside OptimisticInvoicesList's provider
  // on /invoices. Standalone at /invoices/new there is no provider, so `inline`
  // is false: the form passes the bound server action straight to `action` (so
  // React's SSR emits the $ACTION_ID/$ACTION_REF hidden field and the no-JS POST
  // target exists — the PE create path), and the page owns the <h1>. Inline, the
  // form wraps submit to fire the optimistic append in a transition and owns the
  // section <h2>.
  const { addOptimistic, inline } = useAddOptimisticInvoice();
  const [tempId] = useState(() => uuidv7());

  const [defaults, setDefaults] = useState(initialDefaults);
  const [submitCount, setSubmitCount] = useState(0);

  // React 19 resets an uncontrolled `<form action>` on every commit — including
  // a validation failure — so the typed values are echoed back as the next
  // defaultValue set and the field cluster is remounted (the `key`) to re-apply
  // them. This runs on both paths.
  const echoSubmittedValues = (formData: FormData) => {
    setDefaults(
      Object.fromEntries(
        echoedFields.map((field) => [field, String(formData.get(field) ?? '')]),
      ) as Record<(typeof echoedFields)[number], string>,
    );
    setSubmitCount((count) => count + 1);
  };

  // Inline on /invoices: fire the optimistic append and the action in one
  // transition so the pending row paints before the server responds.
  const handleSubmit = (formData: FormData) => {
    startTransition(() => {
      echoSubmittedValues(formData);
      addOptimistic({
        id: tempId,
        number: String(formData.get('number') ?? ''),
        status: (formData.get('status') as InvoiceStatus) ?? 'draft',
        total: String(formData.get('total') ?? ''),
        customerName: '—',
        dueAt: null,
        pending: true,
      });
      formAction(formData);
    });
  };

  return (
    <section className="flex flex-col gap-4">
      {inline && <h2 className="text-lg font-semibold">New invoice</h2>}
      <form
        key={submitCount}
        action={inline ? handleSubmit : formAction}
        // Standalone the bound server action is passed straight to `action` for
        // PE, so this onSubmit (JS only) seeds the value-echo; it never runs on
        // the no-JS POST. Inline, handleSubmit already echoes, so skip it.
        onSubmit={
          inline
            ? undefined
            : (event) => echoSubmittedValues(new FormData(event.currentTarget))
        }
        data-testid="new-invoice-form"
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="id" defaultValue={tempId} />
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

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="_debug_fail" value="1" />
          Simulate failure
        </label>

        {state?.ok === false && state.error.code !== 'validation' && (
          <p role="alert" className="text-destructive">
            {state.error.userMessage}
          </p>
        )}

        <SubmitButton>Create invoice</SubmitButton>
      </form>
    </section>
  );
};
