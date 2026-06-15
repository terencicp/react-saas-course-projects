'use client';

import { useActionState } from 'react';

import {
  resetExports,
  type SimulateState,
  simulateRun,
} from '@/app/(protected)/inspector/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const SIMULATE_STATES: { state: SimulateState; label: string }[] = [
  { state: 'queued', label: 'Simulate queued' },
  { state: 'running', label: 'Simulate running (3/7)' },
  { state: 'completed', label: 'Simulate completed' },
];

// The dev-only debug controls. `simulate-run-control` writes an `exports` row
// directly to a chosen state (no Trigger.dev call) so the run panel figures are
// reproducible; `reset-exports` clears + re-seeds. Each button submits to its
// dev-gated Server Action. Rendered only in non-production.
export const DebugControls = () => {
  const [, simulateAction] = useActionState(simulateRun, null);
  const [, resetAction, resetPending] = useActionState(
    async () => resetExports(),
    null,
  );

  return (
    <Card data-testid="debug-controls" className="p-4">
      <h2 className="text-sm font-semibold">Debug (dev only)</h2>
      <Separator className="my-3" />
      <div
        data-testid="simulate-run-control"
        className="flex flex-wrap items-center gap-2"
      >
        {SIMULATE_STATES.map(({ state, label }) => (
          <form key={state} action={simulateAction}>
            <input type="hidden" name="state" value={state} />
            <Button type="submit" variant="outline" size="sm">
              {label}
            </Button>
          </form>
        ))}
        <form action={resetAction}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            data-testid="reset-exports"
            disabled={resetPending}
          >
            Reset exports
          </Button>
        </form>
      </div>
    </Card>
  );
};
