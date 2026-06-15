'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

// The live-wizard bridge. Opens the wizard in an `<iframe src="/customers/new/
// step-1">` and mirrors the store snapshot it broadcasts via `postMessage` (the
// wizard pages call the provided `useBroadcastSnapshot` hook). Also drives the
// force-double-submit / reset-store / refresh-wizard controls. Provided in full
// — the student writes none of it.

type Snapshot = {
  currentStep?: number;
  completedSteps?: number[];
  contact?: Record<string, string>;
  billing?: Record<string, string>;
  preferences?: {
    channels?: string[];
    defaultCurrency?: string;
    language?: string;
  };
};

export const InspectorPanel = () => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [renderCounts, setRenderCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | { source?: string; snapshot?: Snapshot; field?: string }
        | undefined;
      if (!data || typeof data !== 'object') {
        return;
      }
      if (data.source === 'wizard-snapshot' && data.snapshot) {
        setSnapshot(data.snapshot);
      }
      if (data.source === 'wizard-render' && typeof data.field === 'string') {
        const field = data.field;
        setRenderCounts((prev) => ({
          ...prev,
          [field]: (prev[field] ?? 0) + 1,
        }));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const post = (message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, '*');
  };

  const forceDoubleSubmit = () => {
    post({ source: 'wizard-control', action: 'submit' });
    setTimeout(() => post({ source: 'wizard-control', action: 'submit' }), 10);
  };

  const resetStore = () => post({ source: 'wizard-control', action: 'reset' });

  const refreshWizard = () => {
    const frame = iframeRef.current;
    if (frame) {
      // Force a full reload to a fresh per-request store.
      frame.src = '/customers/new/step-1';
    }
  };

  return (
    <div data-testid="wizard-bridge" className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <iframe
          ref={iframeRef}
          data-testid="wizard-iframe"
          title="New customer wizard"
          src="/customers/new/step-1"
          className="h-[480px] w-full rounded-lg border"
        />

        <div className="space-y-4">
          <section
            data-testid="store-snapshot"
            className="rounded-lg border p-3 text-xs"
          >
            <h3 className="mb-2 font-medium">Store snapshot</h3>
            {snapshot ? (
              <pre className="overflow-auto whitespace-pre-wrap break-all">
                {JSON.stringify(snapshot, null, 2)}
              </pre>
            ) : (
              <p className="text-muted-foreground">
                Waiting for the wizard to broadcast…
              </p>
            )}
          </section>

          <section
            data-testid="render-counter"
            className="rounded-lg border p-3 text-xs"
          >
            <h3 className="mb-2 font-medium">Re-render counts</h3>
            {Object.keys(renderCounts).length === 0 ? (
              <p className="text-muted-foreground">No renders observed yet.</p>
            ) : (
              <ul className="space-y-1 font-mono">
                {Object.entries(renderCounts).map(([field, count]) => (
                  <li
                    key={field}
                    data-testid={`render-count-${field}`}
                    className="flex justify-between gap-4"
                  >
                    <span>{field}</span>
                    <span className="tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="force-double-submit"
          onClick={forceDoubleSubmit}
        >
          Force double-submit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="reset-store"
          onClick={resetStore}
        >
          Reset store
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="refresh-wizard"
          onClick={refreshWizard}
        >
          Refresh wizard
        </Button>
      </div>
    </div>
  );
};
