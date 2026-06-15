import type { Route } from 'next';
import Link from 'next/link';
import {
  forceQuota,
  forceVersionDrift,
  resetAndReseed,
  switchIdentity,
  toggleBypassAuthedRoute,
  toggleForceToolError,
  toggleModelFromInputOrgid,
} from '@/app/inspector/actions';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { activeFilter, archivedFilter } from '@/lib/invoices/scoped-query';
import { allFlags } from '@/server/inspector-flags';
import { getSession } from '@/server/session';
import {
  auditLogs,
  findQuotaRow,
  invoices,
  llmAuditEvents,
  todayUtc,
  users,
} from '@/server/store';

// The inspector and its count panels are the ONLY surface (besides
// `scopedInvoices`) sanctioned to read `store.invoices` directly.
//
// The daily cap is inlined here (not imported from the quota module) so this
// Server Component never reaches into the lib/llm seam — only the two route
// handlers and the chat client touch that module. It mirrors
// `quota.ts`'s `DAILY_TOKEN_CAP`.
const DAILY_TOKEN_CAP = 100_000;

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
  const recentAudit = auditLogs.slice(-20).reverse();

  // A stable, always-live target for the version-drift / two-tabs demo.
  const driftTarget =
    orgRows.find((inv) => inv.id === 'inv-0001') ?? orgRows[0];

  // The LLM verification surface reads the quota/audit "tables" directly — the
  // same exception `scopedInvoices` carves out for invoices. The selected user
  // is the acting identity, so switching identity reframes the whole panel.
  const selectedUserId = session.userId;
  const quotaRow = findQuotaRow(selectedUserId, todayUtc());
  const tokensUsed = quotaRow?.tokensUsed ?? 0;
  const recentLlmAudit = llmAuditEvents.slice(-20).reverse();
  const flags = allFlags();

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

      <section className="space-y-3">
        <h2 className="font-medium">LLM token quota</h2>
        <div data-testid="usage-counter" className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">
            Today&apos;s usage for{' '}
            <span className="font-mono">{selectedUserId}</span>
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {tokensUsed.toLocaleString()} / {DAILY_TOKEN_CAP.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">
            {quotaRow
              ? `Last updated ${quotaRow.updatedAt}`
              : 'No usage recorded today.'}
          </div>
        </div>
        <form
          data-testid="force-quota"
          action={forceQuota}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="userId" value={selectedUserId} />
          <Button type="submit" size="sm" variant="outline">
            Force quota to 99,500
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Pushes the selected user&apos;s today row near the cap so the next
          question crosses the {DAILY_TOKEN_CAP.toLocaleString()} ceiling and
          the 429 refusal is demonstrable.
        </p>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="font-medium">Force tool error</h2>
        <form data-testid="force-tool-error" action={toggleForceToolError}>
          <Button type="submit" size="sm" variant="outline">
            {flags.FORCE_TOOL_ERROR ? 'On — turn off' : 'Off — turn on'}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          When on, <span className="font-mono">getInvoiceStats</span> returns{' '}
          <span className="font-mono">{'{ error: "stats_unavailable" }'}</span>{' '}
          so the stats card&apos;s{' '}
          <span className="font-mono">output-error</span> state renders.
        </p>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="font-medium">LLM audit events (last 20)</h2>
        <ul data-testid="llm-audit-tail" className="space-y-1 text-sm">
          {recentLlmAudit.length === 0 ? (
            <li className="text-muted-foreground">No LLM events yet.</li>
          ) : (
            recentLlmAudit.map((entry) => (
              <li
                key={entry.id}
                data-testid="llm-audit-row"
                className="flex justify-between gap-4 font-mono text-xs"
              >
                <span>{entry.event}</span>
                <span className="text-muted-foreground">
                  {String(entry.payload.finishReason ?? '')}{' '}
                  {JSON.stringify(entry.payload.usage ?? {})}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      <Separator />

      <section data-testid="forge-orgid" className="space-y-3 text-sm">
        <h2 className="font-medium">Forge an orgId (cross-tenant probe)</h2>
        <p className="text-muted-foreground">
          The model may invent an <span className="font-mono">orgId</span> in
          its tool-call arguments, but{' '}
          <span className="font-mono">getInvoiceStats</span> ignores it: the
          tool closes over <span className="font-mono">ctx.orgId</span> from the
          server auth session, so a forged input can never reach another
          org&apos;s rows. To see the leak the closure prevents, flip{' '}
          <span className="font-mono">MODEL_FROM_INPUT_ORGID</span> below (which
          makes the tool read <span className="font-mono">orgId</span> from the
          model input), switch to <span className="font-mono">org-globex</span>,
          and replay a question — the answer crosses tenants.
        </p>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="font-medium">Debug flags</h2>
        <p className="text-xs text-muted-foreground">
          These exist only to make the failure modes visible by hand. Both
          default off and are never reachable in normal operation.
        </p>
        <div className="flex flex-wrap gap-2">
          <form
            data-testid="flag-bypass-authed-route"
            action={toggleBypassAuthedRoute}
          >
            <Button type="submit" size="sm" variant="outline">
              BYPASS_AUTHED_ROUTE: {flags.BYPASS_AUTHED_ROUTE ? 'on' : 'off'}
            </Button>
          </form>
          <form
            data-testid="flag-model-from-input-orgid"
            action={toggleModelFromInputOrgid}
          >
            <Button type="submit" size="sm" variant="outline">
              MODEL_FROM_INPUT_ORGID:{' '}
              {flags.MODEL_FROM_INPUT_ORGID ? 'on' : 'off'}
            </Button>
          </form>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">BYPASS_AUTHED_ROUTE</span> makes{' '}
          <span className="font-mono">authedRoute</span> refuse with a 401 to
          prove the auth guard;{' '}
          <span className="font-mono">MODEL_FROM_INPUT_ORGID</span> makes the
          tool read <span className="font-mono">orgId</span> from the model
          input to expose the cross-tenant leak.
        </p>
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
          described here rather than run live. The same holds for the two LLM
          tables: <span className="font-mono">usage_quota_daily</span> and{' '}
          <span className="font-mono">llm_audit_events</span> are the{' '}
          <span className="font-mono">usageQuota</span> /{' '}
          <span className="font-mono">llmAuditEvents</span> store arrays here —
          same shapes, in-memory.
        </p>
      </section>
    </div>
  );
};

export default InspectorPage;
