import type { Route } from 'next';
import Link from 'next/link';
import type { SearchParams } from 'nuqs/server';
import { FetchedAtStrip } from '@/app/(app)/invoices/fetched-at-strip';
import { CacheButtons } from '@/app/inspector/_components/cache-buttons';
import { CacheLifeReadout } from '@/app/inspector/_components/cachelife-readout';
import { ForceUpdateTagIsland } from '@/app/inspector/_components/force-updatetag-island';
import { HitMissProbe } from '@/app/inspector/_components/hitmiss-probe';
import { InvalidationLog } from '@/app/inspector/_components/invalidation-log';
import { MisuseToggle } from '@/app/inspector/_components/misuse-toggle';
import {
  forceVersionDrift,
  resetAndReseed,
  switchIdentity,
} from '@/app/inspector/actions';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { getOrgInvoiceSummary, listInvoices } from '@/lib/invoices/queries';
import { activeFilter, archivedFilter } from '@/lib/invoices/scoped-query';
import { getSession } from '@/server/session';
import {
  auditLogs,
  invalidationLog,
  invoices,
  misuseFlag,
  users,
} from '@/server/store';

type InspectorPageProps = {
  searchParams: Promise<SearchParams>;
};

// The inspector and its count panels are the ONLY surface (besides
// `scopedInvoices`) sanctioned to read `store.invoices` directly.
const InspectorPage = async ({ searchParams }: InspectorPageProps) => {
  const params = await searchParams;
  const actionResult = params.result;
  const session = await getSession();
  const orgRows = invoices.filter((inv) => inv.orgId === session.orgId);

  const counts = {
    total: orgRows.length,
    active: orgRows.filter(activeFilter).length,
    archived: orgRows.filter(archivedFilter).length,
    deleted: orgRows.filter((inv) => inv.deletedAt !== null).length,
  };

  const identities = users.map((u) => `${u.orgId}:${u.role}`);
  const acting = `${session.orgId}:${session.role}`;
  const recentAudit = auditLogs.slice(-20).reverse();

  // The cache panels read the same cached functions the list page does, with
  // default args, for the active org — so the strip mirrors /invoices.
  const list = await listInvoices({
    orgId: session.orgId,
    role: session.role,
    view: 'active',
    status: null,
    sort: '-createdAt',
    q: '',
    cursor: null,
  });
  const summary = await getOrgInvoiceSummary(session.orgId);
  const recentInvalidations = invalidationLog.slice(-20).reverse();

  // A stable, always-live target for the version-drift / two-tabs demo.
  const driftTarget =
    orgRows.find((inv) => inv.id === 'inv-0001') ?? orgRows[0];

  return (
    <div data-testid="inspector-page" className="space-y-6">
      <h1 className="text-xl font-semibold">Inspector</h1>

      <section
        data-testid="row-counts"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {(
          [
            ['count-total', 'Total', counts.total],
            ['count-active', 'Active', counts.active],
            ['count-archived', 'Archived', counts.archived],
            ['count-deleted', 'Deleted', counts.deleted],
          ] as const
        ).map(([testid, label, value]) => (
          <div
            key={testid}
            data-testid={testid}
            className="rounded-lg border p-3"
          >
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </section>

      <Separator />

      {/* ── Cache panels (chapter 073) ──────────────────────────────────── */}
      <FetchedAtStrip
        listFetchedAt={list.fetchedAt}
        summaryFetchedAt={summary.fetchedAt}
      />

      <CacheLifeReadout />

      <CacheButtons />

      {actionResult ? (
        <p
          data-testid="action-result"
          className="font-mono text-xs text-muted-foreground"
        >
          {String(actionResult)}
        </p>
      ) : null}

      <MisuseToggle on={misuseFlag.misuseRevalidateFromAction} />

      <InvalidationLog entries={recentInvalidations} />

      <HitMissProbe />

      <ForceUpdateTagIsland />

      <Separator />

      <section className="space-y-3">
        <h2 className="font-medium">Acting identity</h2>
        <form
          data-testid="identity-switcher"
          action={switchIdentity}
          className="flex flex-wrap items-center gap-2"
        >
          <select
            name="identity"
            defaultValue={acting}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            {identities.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline">
            Switch
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Currently acting as <span className="font-mono">{acting}</span>.
        </p>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="font-medium">Reset and re-seed</h2>
        <form action={resetAndReseed}>
          <Button type="submit" size="sm" variant="outline">
            Reset and re-seed
          </Button>
        </form>
      </section>

      <Separator />

      {driftTarget ? (
        <section className="space-y-3">
          <h2 className="font-medium">Force version drift</h2>
          <p className="text-xs text-muted-foreground">
            Bumps the stored <span className="font-mono">version</span> of{' '}
            <span className="font-mono">{driftTarget.number}</span> so an open
            edit form goes stale.
          </p>
          <form
            data-testid="force-version-drift"
            action={forceVersionDrift}
            className="flex items-center gap-2"
          >
            <input type="hidden" name="orgId" value={driftTarget.orgId} />
            <input type="hidden" name="id" value={driftTarget.id} />
            <Button type="submit" size="sm" variant="outline">
              Force version drift
            </Button>
          </form>
          <Link
            className="text-sm underline"
            href={`/invoices/${driftTarget.id}/edit` as Route}
            target="_blank"
          >
            Open in two tabs (edit this invoice)
          </Link>
        </section>
      ) : null}

      <Separator />

      <section className="space-y-3">
        <h2 className="font-medium">Audit log (last 20)</h2>
        <ul data-testid="audit-tail" className="space-y-1 text-sm">
          {recentAudit.length === 0 ? (
            <li className="text-muted-foreground">No audit entries yet.</li>
          ) : (
            recentAudit.map((entry) => (
              <li
                key={entry.id}
                data-testid="audit-row"
                className="flex justify-between gap-4 font-mono text-xs"
              >
                <span>{entry.action}</span>
                <span className="text-muted-foreground">{entry.subjectId}</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <Separator />

      <section data-testid="index-explainer" className="space-y-2 text-sm">
        <h2 className="font-medium">
          Index &amp; query plan (in real Postgres)
        </h2>
        <p className="text-muted-foreground">
          In the SQL-backed version of this app, reads run against a{' '}
          <span className="font-mono">invoices</span> table with a partial
          unique index{' '}
          <span className="font-mono">
            UNIQUE (org_id, number) WHERE deleted_at IS NULL
          </span>{' '}
          — so a soft-deleted row frees its number for re-use while live rows
          stay unique. The list query is tenant-scoped and lifecycle-filtered,
          sorted on an indexed column and paged with a keyset cursor; an{' '}
          <span className="font-mono">EXPLAIN ANALYZE</span> shows an index scan
          rather than a sequential scan. This project executes the same{' '}
          <em>shapes</em> against the in-memory store, so the SQL artifacts are
          described here rather than run live.
        </p>
      </section>
    </div>
  );
};

export default InspectorPage;
