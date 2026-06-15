'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { SubmitButton } from '@/app/_components/submit-button';
import { ConflictBanner } from '@/app/[locale]/(app)/invoices/[id]/edit/conflict-banner';
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
import type { InvoiceRow } from '@/lib/invoices/queries';
import { type Role, roleAtLeast } from '@/server/types';

// `useActionState` gives the form root the action result + pending state. The
// inputs stay uncontrolled (`defaultValue`); to reset them to the server's row
// after "Use latest", the field block is keyed on the seed's version so it
// remounts with fresh defaults. The hidden `version` round-trips with the form.
export const EditForm = ({
  invoice,
  role,
}: {
  invoice: InvoiceRow;
  role: Role;
}) => {
  const [state, action] = useActionState(updateInvoice, null);
  const formRef = useRef<HTMLFormElement>(null);

  // The form's row. On `ok:true` it becomes the returned row so the next save
  // does not self-conflict; "Use latest" swaps it for the server's `current`.
  const [seed, setSeed] = useState(invoice);
  const [conflictRow, setConflictRow] = useState<InvoiceRow | null>(null);

  useEffect(() => {
    if (!state) {
      return;
    }
    if (state.ok) {
      setSeed(state.data);
      setConflictRow(null);
      return;
    }
    setConflictRow(
      state.error.code === 'conflict'
        ? (state.error.current as InvoiceRow)
        : null,
    );
  }, [state]);

  // "Use latest": pull the server's current values into the form and reset the
  // hidden version (via the keyed remount) so the resubmit matches and succeeds.
  const onUseLatest = () => {
    if (conflictRow) {
      setSeed(conflictRow);
      setConflictRow(null);
    }
  };

  // Drive the action through a plain client function rather than handing the
  // `useActionState` dispatcher straight to `action`. A bare server-action
  // dispatcher makes React render its progressive-enhancement encoding
  // (`$ACTION_*`) as hidden inputs; on submit those leak into the FormData and
  // the action's `z.strictObject` rejects them as unrecognized keys (the save
  // never reaches the mutation). The wrapper submits only the user-named fields.
  const onSubmit = (formData: FormData) => {
    action(formData);
  };

  // "Overwrite anyway": resend the user's edits with the admin-only bypass flag.
  // The version mismatch is intentionally ignored server-side; the gate is
  // re-checked at the action, so a forged flag from a member is still refused.
  const onOverwrite = () => {
    const form = formRef.current;
    if (!form) {
      return;
    }
    const formData = new FormData(form);
    formData.set('overwrite', 'true');
    action(formData);
  };

  return (
    <form
      ref={formRef}
      data-testid="edit-form"
      action={onSubmit}
      className="space-y-4"
    >
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

      {conflictRow ? (
        <ConflictBanner
          current={conflictRow}
          onUseLatest={onUseLatest}
          onOverwrite={onOverwrite}
          canOverwrite={roleAtLeast(role, 'admin')}
        />
      ) : null}
    </form>
  );
};
