import { Suspense } from 'react';

import { ActingUserSwitcher } from '@/app/(protected)/inspector/_components/acting-user-switcher';
import { DebugControls } from '@/app/(protected)/inspector/_components/debug-controls';
import { RunConsole } from '@/app/(protected)/inspector/_components/run-console';
import type { SeededRunState } from '@/app/(protected)/inspector/_components/run-panel';
import {
  getInspectorContext,
  latestExport,
  recentExports,
} from '@/app/(protected)/inspector/_data';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { recentAuditLogs } from '@/db/queries/audit';

// The verification surface for the durable-CSV-export work. The inspector renders
// the per-org export controls, the recent-exports table, a run panel reflecting the
// most-recent row, and the audit tail — every panel a bounded region with a
// data-testid, request-time reads behind <Suspense>. The whole surface is provided;
// the student writes only the task code + startExport it exercises. At render time
// the run panel renders from the seed/simulate path (no live worker).

const isDev = process.env.NODE_ENV !== 'production';

const HeaderPanel = async () => {
  const { userId, orgId, members } = await getInspectorContext();
  const seededRow = await latestExport(orgId);

  const seeded: SeededRunState | null = seededRow
    ? {
        runId: seededRow.runId,
        status: seededRow.status,
        pagesDone: seededRow.pagesDone,
        pagesTotal: seededRow.pagesTotal,
        attempt: null,
        downloadUrl: seededRow.downloadUrl,
      }
    : null;

  return (
    <RunConsole
      seeded={seeded}
      identitySwitcher={
        isDev ? (
          <ActingUserSwitcher users={members} activeUserId={userId} />
        ) : undefined
      }
    />
  );
};

const ExportsTable = async () => {
  const { orgId } = await getInspectorContext();
  const rows = await recentExports(orgId);

  return (
    <Card data-testid="exports-table" className="p-4">
      <h2 className="text-sm font-semibold">Recent exports</h2>
      <Separator className="my-3" />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No exports yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.id}
              data-testid="export-row"
              className="flex items-center justify-between gap-4 text-sm"
            >
              <span className="truncate font-mono">{row.runId ?? row.id}</span>
              <span className="text-muted-foreground">{row.status}</span>
              <span className="text-muted-foreground">
                {row.rowCount ?? '—'} rows
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const AuditTail = async () => {
  const { orgId } = await getInspectorContext();
  const rows = await recentAuditLogs(orgId);

  return (
    <Card data-testid="audit-tail" className="p-4">
      <h2 className="text-sm font-semibold">Audit log</h2>
      <Separator className="my-3" />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit events yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id} data-testid="audit-row" className="text-sm">
              {row.action}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const InspectorPage = () => (
  <section
    data-testid="inspector-page"
    className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10"
  >
    <h1 className="text-2xl font-semibold">Export inspector</h1>

    <Suspense>
      <HeaderPanel />
    </Suspense>

    <div className="grid gap-6 md:grid-cols-2">
      <Suspense>
        <ExportsTable />
      </Suspense>
      <Suspense>
        <AuditTail />
      </Suspense>
    </div>

    {isDev && <DebugControls />}
  </section>
);

export default InspectorPage;
