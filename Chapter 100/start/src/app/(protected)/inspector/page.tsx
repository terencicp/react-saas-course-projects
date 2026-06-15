import type { Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { OrgSwitcher } from '@/app/(protected)/dashboard/org-switcher';
import { ActingUserSwitcher } from '@/app/(protected)/inspector/_components/acting-user-switcher';
import { ForceVersionDrift } from '@/app/(protected)/inspector/_components/force-version-drift';
import { ResetButton } from '@/app/(protected)/inspector/_components/reset-button';
import { TestErrorButton } from '@/app/(protected)/inspector/_components/test-error-button';
import {
  dataIntegrity,
  deploymentEnv,
  getInspectorContext,
  recentAudit,
  recentMoneyRows,
  schemaColumns,
  splitCoverage,
} from '@/app/(protected)/inspector/_data';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

// The verification surface for the live-migration work. In production the page is
// admin-gated; locally it is open. Each panel is one bounded region with a
// data-testid; request-time reads sit behind <Suspense>. The panels read whatever
// the schema currently is, so they render correctly at every cadence stage — that
// progression IS the teaching surface, not a failure.

const isDev = process.env.NODE_ENV !== 'production';

const IdentityBanner = async () => {
  const { userId, orgId, orgName, role, orgs, members } =
    await getInspectorContext();

  return (
    <Card
      data-testid="identity-switcher"
      className="flex flex-wrap items-center justify-between gap-4 p-4"
    >
      <div>
        <p className="text-xs uppercase text-muted-foreground">Active org</p>
        <p className="text-lg font-semibold">{orgName}</p>
        <p className="text-sm text-muted-foreground">{role}</p>
      </div>
      <div data-testid="org-switcher" className="flex items-center gap-2">
        <OrgSwitcher orgs={orgs} activeOrgId={orgId} />
        {isDev && <ActingUserSwitcher users={members} activeUserId={userId} />}
      </div>
    </Card>
  );
};

const SchemaStatePanel = async () => {
  const columns = await schemaColumns();

  return (
    <Card data-testid="schema-state-panel" className="p-4">
      <h2 className="text-sm font-semibold">invoices schema</h2>
      <Separator className="my-3" />
      <ul className="flex flex-col gap-1 text-sm">
        {columns.map((column) => (
          <li
            key={column.name}
            data-testid="schema-state-row"
            className="flex items-center justify-between gap-4 font-mono text-xs"
          >
            <span data-testid="schema-col-name">{column.name}</span>
            <span
              data-testid="schema-col-nullable"
              className="text-muted-foreground"
            >
              {column.nullable ? 'YES' : 'NO'}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
};

const SplitCoveragePanel = async () => {
  const { orgId } = await getInspectorContext();
  const coverage = await splitCoverage(orgId);

  return (
    <Card data-testid="split-coverage-panel" className="p-4">
      <h2 className="text-sm font-semibold">Split coverage</h2>
      <Separator className="my-3" />
      {coverage.columnPresent ? (
        <dl className="text-sm">
          <dt className="text-muted-foreground">subtotal populated</dt>
          <dd
            data-testid="split-coverage-pct"
            className="text-2xl font-semibold tabular-nums"
          >
            {coverage.pct}%
          </dd>
          <dt className="mt-2 text-muted-foreground">rows still null</dt>
          <dd data-testid="split-coverage-null-count" className="font-mono">
            {coverage.nullSubtotal}
          </dd>
        </dl>
      ) : (
        <p
          data-testid="split-coverage-pct"
          className="text-sm text-muted-foreground"
        >
          Pre-expand — no subtotal column yet.
        </p>
      )}
    </Card>
  );
};

const DualWritePanel = async () => {
  const { orgId } = await getInspectorContext();
  const rows = await recentMoneyRows(orgId);

  return (
    <Card data-testid="dual-write-panel" className="p-4">
      <h2 className="text-sm font-semibold">Recent rows (dual-write)</h2>
      <Separator className="my-3" />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices yet.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-xs font-mono">
          {rows.map((row) => (
            <li
              key={row.id}
              data-testid="dual-write-row"
              className="flex items-center justify-between gap-3"
            >
              <span>{row.number}</span>
              <span data-testid="dw-subtotal">{row.subtotal ?? '—'}</span>
              <span data-testid="dw-tax">{row.tax ?? '—'}</span>
              <span data-testid="dw-total">{row.total ?? '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const DataIntegrityPanel = async () => {
  const { orgId } = await getInspectorContext();
  const state = await dataIntegrity(orgId);

  return (
    <Card data-testid="data-integrity-panel" className="p-4">
      <h2 className="text-sm font-semibold">Data integrity</h2>
      <Separator className="my-3" />
      {state.kind === 'na' ? (
        <p className="text-sm text-muted-foreground">n/a — total dropped</p>
      ) : state.kind === 'ok' ? (
        <p className="text-sm text-muted-foreground">
          No divergent rows (subtotal + tax = total).
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-xs font-mono">
          {state.rows.map((row) => (
            <li key={row.id} data-testid="data-integrity-row">
              {row.number}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const AuditTail = async () => {
  const { orgId } = await getInspectorContext();
  const rows = await recentAudit(orgId);

  return (
    <Card data-testid="audit-tail" className="p-4">
      <h2 className="text-sm font-semibold">Audit log</h2>
      <Separator className="my-3" />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit events yet.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {rows.map((row) => (
            <li
              key={row.id}
              data-testid="audit-row"
              className="font-mono text-xs"
            >
              {row.action}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const DeploymentPanel = () => {
  const { environment, commitSha, buildSource } = deploymentEnv();

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">Deployment environment</h2>
        <Separator className="my-3" />
        <span
          data-testid="deployment-env-badge"
          className="inline-flex items-center rounded-full border bg-muted px-2.5 py-0.5 text-xs"
        >
          {environment}
        </span>
      </div>
      <div data-testid="build-source-panel">
        <p className="text-xs uppercase text-muted-foreground">Build source</p>
        <p className="text-sm">{buildSource}</p>
        <p data-testid="build-commit-sha" className="font-mono text-xs">
          {commitSha}
        </p>
      </div>
      <Link
        data-testid="health-link"
        className="text-sm underline"
        href={'/api/health' as Route}
      >
        /api/health
      </Link>
    </Card>
  );
};

const DevControls = async () => {
  const { orgId } = await getInspectorContext();
  const rows = await recentMoneyRows(orgId);
  const driftTarget = rows[0];

  return (
    <Card className="flex flex-wrap items-center gap-4 p-4">
      <ResetButton />
      {driftTarget ? (
        <ForceVersionDrift
          invoiceId={driftTarget.id}
          invoiceNumber={driftTarget.number}
        />
      ) : null}
      <TestErrorButton />
    </Card>
  );
};

const InspectorPage = () => (
  <section
    data-testid="inspector-page"
    className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10"
  >
    <h1 className="text-2xl font-semibold">Inspector</h1>

    <Suspense>
      <IdentityBanner />
    </Suspense>

    <div className="grid gap-6 md:grid-cols-2">
      <Suspense>
        <SchemaStatePanel />
      </Suspense>
      <Suspense>
        <SplitCoveragePanel />
      </Suspense>
      <Suspense>
        <DualWritePanel />
      </Suspense>
      <Suspense>
        <DataIntegrityPanel />
      </Suspense>
      <Suspense>
        <AuditTail />
      </Suspense>
      <DeploymentPanel />
    </div>

    {isDev && (
      <Suspense>
        <DevControls />
      </Suspense>
    )}
  </section>
);

export default InspectorPage;
