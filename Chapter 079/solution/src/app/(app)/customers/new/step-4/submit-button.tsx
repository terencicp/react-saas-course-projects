'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWizardStore } from '@/app/(app)/customers/new/_components/use-wizard-store';
import { createCustomer } from '@/app/(app)/customers/new/_lib/wizard/actions';
import { Button } from '@/components/ui/button';

// The only client↔server seam. `isPending` gates both the label and the
// double-submit guard — the first click disables the button while the
// transition runs, so a second click fires no handler. On success the store
// resets *before* `router.push` (the new id is server state the redirect
// transitions to, never stashed in the store); on failure the local error is
// set and the draft is left untouched.
export const SubmitButton = () => {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const reset = useWizardStore((s) => s.reset);
  const { contact, billing, preferences } = useWizardStore(
    useShallow((s) => ({
      contact: s.contact,
      billing: s.billing,
      preferences: s.preferences,
    })),
  );
  const router = useRouter();

  const onSubmit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createCustomer({ contact, billing, preferences });
      if (!result.ok) {
        setError(result.error.userMessage);
        return;
      }
      reset();
      router.push(`/customers/${result.data.id}` as Route);
    });
  };

  return (
    <div className="space-y-2">
      {error !== null ? (
        <p data-testid="submit-error" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        data-testid="wizard-submit"
        disabled={isPending}
        onClick={onSubmit}
      >
        {isPending ? 'Creating…' : 'Create customer'}
      </Button>
    </div>
  );
};
