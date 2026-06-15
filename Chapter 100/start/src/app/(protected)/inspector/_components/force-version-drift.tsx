'use client';

import { useActionState } from 'react';

import { forceVersionDrift } from '@/app/(protected)/inspector/actions';
import { Button } from '@/components/ui/button';

type ForceVersionDriftProps = {
  invoiceId: string;
  invoiceNumber: string;
};

// Dev-only: bump the stored `version` of a target invoice so an open edit form
// goes stale, driving the optimistic-concurrency 409 path.
export const ForceVersionDrift = ({
  invoiceId,
  invoiceNumber,
}: ForceVersionDriftProps) => {
  const [, formAction, pending] = useActionState(forceVersionDrift, null);

  return (
    <form
      action={formAction}
      data-testid="force-version-drift"
      className="flex items-center gap-2"
    >
      <input type="hidden" name="id" value={invoiceId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Force version drift on {invoiceNumber}
      </Button>
    </form>
  );
};
