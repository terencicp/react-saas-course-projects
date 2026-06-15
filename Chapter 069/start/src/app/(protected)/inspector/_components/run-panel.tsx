'use client';

import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

// The persisted shape the run panel falls back to when no live `runId` poller is
// active (the seed/simulate path). Mirrors the `exports` row columns the panel reads.
export type SeededRunState = {
  runId: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  pagesDone: number | null;
  pagesTotal: number | null;
  attempt: number | null;
  downloadUrl: string | null;
};

// The shape the poller fetches from /api/exports/[runId] (mapped from retrieveRun).
type LiveRunState = {
  status: string;
  metadata: { pagesDone?: number; pagesTotal?: number; downloadUrl?: string };
  attemptCount?: number;
  completedAt: string | null;
  error: { message: string } | null;
};

// The dashboard deep-link is an external Trigger.dev URL — a plain <a href> outside
// typedRoutes (no `as Route` cast). The base is the standard cloud host.
const dashboardRunUrl = (runId: string): string =>
  `https://cloud.trigger.dev/runs/${runId}`;

type RunPanelProps = {
  // When set (the export button just fired), the panel polls this run id live.
  activeRunId: string | null;
  // The persisted most-recent export row — the no-live-runId fallback.
  seeded: SeededRunState | null;
};

// The run panel reads run state from the client poller; when no real `runId` is
// present it renders the most-recent `exports` row's persisted state — so the
// simulate-run debug and the seed both render a panel without a live worker. The
// progress bar is ONE bounded region at any pagesDone/pagesTotal: one <progress>
// element, never one per page.
export const RunPanel = ({ activeRunId, seeded }: RunPanelProps) => {
  const [live, setLive] = useState<LiveRunState | null>(null);

  useEffect(() => {
    if (!activeRunId) {
      setLive(null);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/exports/${activeRunId}`);
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as LiveRunState;
        if (!cancelled) {
          setLive(data);
        }
      } catch {
        // Transient poll failure — the next tick retries.
      }
    };

    void poll();
    const handle = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [activeRunId]);

  // Live poller wins when present; otherwise the persisted row drives the panel.
  const runId = activeRunId ?? seeded?.runId ?? null;
  const status = live?.status?.toLowerCase() ?? seeded?.status ?? 'queued';
  const pagesDone = live?.metadata.pagesDone ?? seeded?.pagesDone ?? 0;
  const pagesTotal = live?.metadata.pagesTotal ?? seeded?.pagesTotal ?? 0;
  const attempt = live?.attemptCount ?? seeded?.attempt ?? 1;
  const downloadUrl = live?.metadata.downloadUrl ?? seeded?.downloadUrl ?? null;

  const ratio = pagesTotal > 0 ? (pagesDone / pagesTotal) * 100 : 0;
  const isCompleted = status === 'completed';

  return (
    <Card data-testid="run-panel" className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Run</h2>
        <Badge data-testid="run-status" variant="secondary">
          {status}
        </Badge>
      </div>
      <Separator className="my-3" />

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Run id</dt>
        <dd data-testid="run-id" className="truncate font-mono">
          {runId ?? '—'}
        </dd>
        <dt className="text-muted-foreground">Attempt</dt>
        <dd data-testid="run-attempt" className="font-mono">
          {attempt}
        </dd>
      </dl>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Pages</span>
          <span data-testid="run-progress-label">
            {pagesDone}/{pagesTotal}
          </span>
        </div>
        <Progress
          data-testid="run-progress"
          value={ratio}
          aria-valuenow={pagesDone}
          aria-valuemin={0}
          aria-valuemax={pagesTotal || 1}
        />
      </div>

      {isCompleted && downloadUrl && (
        <div className="mt-4 flex flex-col gap-1 text-sm">
          <a
            data-testid="run-download-url"
            href={downloadUrl}
            className="truncate text-brand underline"
          >
            {downloadUrl}
          </a>
          {runId && (
            <a
              data-testid="run-dashboard-link"
              href={dashboardRunUrl(runId)}
              className="text-xs text-muted-foreground underline"
            >
              View run in Trigger.dev dashboard
            </a>
          )}
        </div>
      )}
    </Card>
  );
};
