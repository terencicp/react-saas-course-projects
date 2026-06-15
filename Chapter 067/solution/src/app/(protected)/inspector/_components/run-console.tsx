'use client';

import type { ReactNode } from 'react';
import { useActionState, useEffect, useState } from 'react';

import {
  RunPanel,
  type SeededRunState,
} from '@/app/(protected)/inspector/_components/run-panel';
import { Button } from '@/components/ui/button';
import { startExport } from '@/lib/exports/start';

type RunConsoleProps = {
  seeded: SeededRunState | null;
  // The identity switcher island, rendered inside the header region (so the header
  // is one bounded region carrying the export controls + the switcher together).
  identitySwitcher?: ReactNode;
};

// The interactive export surface. Holds the active run id so the Export button and
// the run panel share it: clicking Export fires `startExport`, and on { ok: true }
// the panel switches to the returned runId and starts its 1s poller. Until L2's
// startExport is wired, the inert stub returns an error Result and the button shows
// it — the run panel falls back to the seeded/simulated row. The debug buttons
// ("2 same-org", "3 cross-org") fire the same action; their live effect (queue
// serialization / cross-org parallelism) is the lessons' by-hand checklist.
export const RunConsole = ({ seeded, identitySwitcher }: RunConsoleProps) => {
  const [state, formAction, pending] = useActionState(startExport, null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  useEffect(() => {
    if (state?.ok) {
      setActiveRunId(state.data.runId);
    }
  }, [state]);

  return (
    <div className="flex flex-col gap-4">
      <section
        data-testid="inspector-header"
        className="flex flex-wrap items-center gap-2"
      >
        <form action={formAction}>
          <Button type="submit" data-testid="export-button" disabled={pending}>
            Export invoices
          </Button>
        </form>
        <form action={formAction}>
          <Button
            type="submit"
            variant="outline"
            data-testid="trigger-two-same-org"
            disabled={pending}
          >
            Trigger 2 (same org)
          </Button>
        </form>
        <form action={formAction}>
          <Button
            type="submit"
            variant="outline"
            data-testid="trigger-three-cross-org"
            disabled={pending}
          >
            Trigger 3 (cross org)
          </Button>
        </form>
        {identitySwitcher}
      </section>

      {state && !state.ok && (
        <p className="text-sm text-destructive">{state.error.userMessage}</p>
      )}

      <RunPanel activeRunId={activeRunId} seeded={seeded} />
    </div>
  );
};
