'use client';

import { useActionState, useState } from 'react';

import { triggerTestError } from '@/app/(protected)/inspector/actions';
import { Button } from '@/components/ui/button';

// Dev-only: fire a real throw so the launch-checklist Sentry-wiring gesture has an
// in-app trigger. The thrown action rejects; we surface the outcome in the
// test-error region (its delivery to Sentry is by-hand).
export const TestErrorButton = () => {
  const [thrown, setThrown] = useState(false);
  const [, formAction, pending] = useActionState(async () => {
    try {
      await triggerTestError(null);
      return null;
    } catch {
      setThrown(true);
      return null;
    }
  }, null);

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          data-testid="test-error-button"
          disabled={pending}
        >
          Trigger a test error
        </Button>
      </form>
      <p
        data-testid="test-error-result"
        className="text-xs text-muted-foreground"
      >
        {thrown
          ? 'Test error thrown — check Sentry for delivery.'
          : 'No test error fired yet.'}
      </p>
    </div>
  );
};
