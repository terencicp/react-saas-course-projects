'use client';

import { useActionState } from 'react';

import { resetAndReseedAction } from '@/app/(protected)/inspector/actions';
import { Button } from '@/components/ui/button';

// Dev-only: re-run the deterministic seed to return to a known state.
export const ResetButton = () => {
  const [, formAction, pending] = useActionState(
    () => resetAndReseedAction(),
    null,
  );

  return (
    <form action={formAction} data-testid="reset-reseed">
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? 'Reseeding…' : 'Reset and re-seed'}
      </Button>
    </form>
  );
};
