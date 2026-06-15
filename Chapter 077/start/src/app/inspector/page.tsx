import type { Route } from 'next';
import Link from 'next/link';
import {
  armForceFailureAction,
  clearClientCacheAction,
  forceVersionDrift,
  insertCoworkerCommentAction,
  resetAndReseed,
  switchIdentity,
} from '@/app/inspector/actions';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { isForceFailureArmed } from '@/lib/comments/force-failure';
import { activeFilter, archivedFilter } from '@/lib/invoices/scoped-query';
import { getSession } from '@/server/session';
import { auditLogs, invoices, users } from '@/server/store';

// The focal invoice per org — the one seeded with a deep comment thread. The
// inspector's comment controls target it.
const FOCAL_INVOICE: Record<string, string> = {
  'org-acme': 'inv-0001',
  'org-globex': 'glx-0001',
};

// The inspector and its count panels are the ONLY surface (besides
// `scopedInvoices`) sanctioned to read `store.invoices` directly.
const InspectorPage = async () => {
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

  // Comment audit tail: last 20 `comment.added` rows for the active org.
  const commentAudit = auditLogs
    .filter(
      (entry) =>
        entry.orgId === session.orgId && entry.action === 'comment.added',
    )
    .slice(-20)
    .reverse();

  const focalId = FOCAL_INVOICE[session.orgId] ?? 'inv-0001';
  const focalRoute = `/invoices/${focalId}` as Route;
  const armed = isForceFailureArmed(session.userId);

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
        <h2 className="font-medium">Comment thread controls</h2>
        <p className="text-xs text-muted-foreground">
          Focal invoice for the comment thread demo:{' '}
          <Link className="underline" href={focalRoute} target="_blank">
            <span className="font-mono">{focalId}</span>
          </Link>
          .
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <form action={insertCoworkerCommentAction}>
            <input type="hidden" name="invoiceId" value={focalId} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              data-testid="insert-coworker-comment"
            >
              Insert coworker comment
            </Button>
          </form>

          <form action={armForceFailureAction}>
            <Button
              type="submit"
              size="sm"
              variant="outline"
              data-testid="force-500"
            >
              Force 500 on next POST
            </Button>
          </form>

          <form action={clearClientCacheAction}>
            <input type="hidden" name="invoiceId" value={focalId} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              data-testid="clear-client-cache"
            >
              Clear client cache
            </Button>
          </form>
        </div>

        <p
          data-testid="force-500-state"
          className="text-xs text-muted-foreground"
        >
          Force 500 is{' '}
          <span className="font-mono">{armed ? 'armed' : 'disarmed'}</span> for{' '}
          <span className="font-mono">{session.userId}</span>.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            data-testid="toggle-polling"
            className="text-sm underline"
            href={`${focalRoute}?poll=off` as Route}
            target="_blank"
          >
            Open thread with background polling OFF
          </Link>
        </div>
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
        <h2 className="font-medium">Comment audit (last 20)</h2>
        <ul data-testid="audit-tail" className="space-y-1 text-sm">
          {commentAudit.length === 0 ? (
            <li className="text-muted-foreground">
              No <span className="font-mono">comment.added</span> entries yet.
            </li>
          ) : (
            commentAudit.map((entry) => (
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
          In the SQL-backed version of this app, reads run against an{' '}
          <span className="font-mono">invoices</span> table with a partial
          unique index{' '}
          <span className="font-mono">
            UNIQUE (org_id, number) WHERE deleted_at IS NULL
          </span>{' '}
          — so a soft-deleted row frees its number for re-use while live rows
          stay unique. The comment thread reads a{' '}
          <span className="font-mono">comments</span> table keyset-paged on{' '}
          <span className="font-mono">(created_at, id)</span> and scoped to{' '}
          <span className="font-mono">org_id</span>. This project executes the
          same <em>shapes</em> against the in-memory store, so the SQL artifacts
          are described here rather than run live.
        </p>
      </section>
    </div>
  );
};

export default InspectorPage;
