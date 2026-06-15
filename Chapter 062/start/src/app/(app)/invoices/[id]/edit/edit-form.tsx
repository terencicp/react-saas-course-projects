'use client';

import { useActionState, useEffect, useState } from 'react';
import { SubmitButton } from '@/app/_components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateInvoice } from '@/lib/invoices/actions';
import type { Invoice, Role } from '@/server/types';

// TODO(L5) — render ConflictBanner on the conflict branch.
//
// `useActionState` gives the form root the action result + pending state. The
// inputs stay uncontrolled (`defaultValue`) and the hidden `version` round-trips
// with the form. The student extends the result handling so an `error.code ===
// 'conflict'` Result renders `<ConflictBanner current={...} />` with the
// recovery controls.
export const EditForm = ({
  invoice,
  role: _role,
}: {
  invoice: Invoice;
  role: Role;
}) => {
  const [state, action] = useActionState(updateInvoice, null);

  // The form's row. On `ok:true` it becomes the returned row so the next save
  // does not self-conflict; the field block is keyed on the seed's version so it
  // remounts with fresh uncontrolled defaults.
  const [seed, setSeed] = useState(invoice);

  useEffect(() => {
    if (state?.ok) {
      setSeed(state.data);
    }
  }, [state]);

  // Drive the action through a plain client function rather than handing the
  // `useActionState` dispatcher straight to `action`. A bare server-action
  // dispatcher makes React render its progressive-enhancement encoding
  // (`$ACTION_*`) as hidden inputs; on submit those leak into the FormData and
  // the action's `z.strictObject` rejects them as unrecognized keys. The wrapper
  // submits only the user-named fields.
  const onSubmit = (formData: FormData) => {
    action(formData);
  };

  return (
    <form data-testid="edit-form" action={onSubmit} className="space-y-4">
      <div key={`${seed.id}:${seed.version}`} className="space-y-4">
        <input type="hidden" name="id" defaultValue={seed.id} />
        <input
          type="hidden"
          name="version"
          data-testid="version-input"
          defaultValue={seed.version}
        />

        <div className="space-y-1.5">
          <Label htmlFor="customerName">Customer</Label>
          <Input
            id="customerName"
            name="customerName"
            defaultValue={seed.customerName}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <Select name="status" defaultValue={seed.status}>
            <SelectTrigger id="status" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="total">Total</Label>
          <Input id="total" name="total" defaultValue={seed.total} />
        </div>
      </div>

      <SubmitButton>Save</SubmitButton>
    </form>
  );
};
