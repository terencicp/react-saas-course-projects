'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { SubmitButton } from '@/app/_components/submit-button';
import { ConflictBanner } from '@/app/(protected)/invoices/[id]/edit/conflict-banner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type Role, roleAtLeast } from '@/lib/auth/roles';
import { updateInvoice } from '@/lib/invoices/actions';
import type { InvoiceRow } from '@/lib/invoices/queries';

// `useActionState` gives the form root the action result + pending state. The
// inputs stay uncontrolled (`defaultValue`); the field block is keyed on the
// seed's version so "Use latest" remounts it with fresh defaults. The hidden
// `version` round-trips with the form.
export const EditForm = ({
  invoice,
  role,
}: {
  invoice: InvoiceRow;
  role: Role;
}) => {
  const [state, action] = useActionState(updateInvoice, null);
  const formRef = useRef<HTMLFormElement>(null);

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

  const onUseLatest = () => {
    if (conflictRow) {
      setSeed(conflictRow);
      setConflictRow(null);
    }
  };

  // Drive the action through a plain client function so React's
  // progressive-enhancement hidden inputs ($ACTION_*) never leak into the
  // FormData the action's z.strictObject parses.
  const onSubmit = (formData: FormData) => {
    action(formData);
  };

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

        {/* The baseline single combined-amount input. */}
        {/* TODO(L4) — split Amount into Subtotal + Tax inputs */}
        {/* TODO(L5) — retire any remaining combined-amount affordance */}
        <div className="space-y-1.5">
          <Label htmlFor="total">Total</Label>
          <Input
            id="total"
            name="total"
            data-testid="total-input"
            defaultValue={seed.total}
          />
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
