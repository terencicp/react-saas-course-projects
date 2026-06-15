import {
  armForceFailureForActor,
  resetAndReseed,
  switchIdentity,
  toggleDebugFlag,
} from '@/app/inspector/actions';
import { InspectorPanel } from '@/app/inspector/inspector-panel';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DEBUG_FLAGS, readDebugFlags } from '@/lib/debug-flags';
import { getSession } from '@/server/session';
import { auditLogs, customers, users } from '@/server/store';

// The inspector and its count panels are the surface sanctioned to read the
// store directly. Provided in full — the student writes none of it.
const InspectorPage = async () => {
  const session = await getSession();
  const flags = await readDebugFlags();

  const orgCustomers = customers.filter((c) => c.orgId === session.orgId);
  const identities = users.map((u) => `${u.orgId}:${u.role}`);
  const orgs = Array.from(new Set(users.map((u) => u.orgId)));
  const acting = `${session.orgId}:${session.role}`;

  // Last 20 customer.created rows for the active org.
  const recentAudit = auditLogs
    .filter(
      (entry) =>
        entry.orgId === session.orgId && entry.action === 'customer.created',
    )
    .slice(-20)
    .reverse();

  return (
    <div data-testid="inspector-page" className="space-y-6">
      <h1 className="text-xl font-semibold">Inspector</h1>

      <section
        data-testid="row-counts"
        className="grid grid-cols-2 gap-3 sm:grid-cols-2"
      >
        <div data-testid="count-customers" className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Customers (org)</div>
          <div className="text-2xl font-semibold tabular-nums">
            {orgCustomers.length}
          </div>
        </div>
        <div data-testid="count-acting" className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Acting as</div>
          <div className="text-lg font-mono">{acting}</div>
        </div>
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
            Switch user
          </Button>
        </form>
        <form
          data-testid="org-switcher"
          action={switchIdentity}
          className="flex flex-wrap items-center gap-2"
        >
          <select
            name="identity"
            defaultValue={`${session.orgId}:${session.role}`}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            {orgs.map((org) => (
              <option key={org} value={`${org}:${session.role}`}>
                {org}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline">
            Switch org
          </Button>
        </form>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="font-medium">Live wizard</h2>
        <InspectorPanel />
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="font-medium">Force action failure</h2>
        <p className="text-xs text-muted-foreground">
          Arms the acting user's next{' '}
          <span className="font-mono">createCustomer</span> to return an
          internal error (after a short delay) and write no audit row.
          Auto-clears after one submit.
        </p>
        <form
          data-testid="force-action-failure"
          action={armForceFailureForActor}
        >
          <input type="hidden" name="userId" value={session.userId} />
          <Button type="submit" size="sm" variant="outline">
            Arm force-failure
          </Button>
        </form>
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

      <section data-testid="debug-flags" className="space-y-3">
        <h2 className="font-medium">Debug flags</h2>
        <p className="text-xs text-muted-foreground">
          Flip a canonical Zustand bug into existence and revert it.
        </p>
        <div className="space-y-2">
          {DEBUG_FLAGS.map((flag) => (
            <form
              key={flag}
              data-testid={`debug-flag-${flag}`}
              action={toggleDebugFlag}
              className="flex items-center justify-between gap-4 rounded-lg border p-2 text-sm"
            >
              <span className="font-mono">{flag}</span>
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {flags[flag] ? 'on' : 'off'}
                </span>
                <input type="hidden" name="flag" value={flag} />
                <input
                  type="hidden"
                  name="on"
                  value={flags[flag] ? '0' : '1'}
                />
                <Button type="submit" size="sm" variant="outline">
                  {flags[flag] ? 'Turn off' : 'Turn on'}
                </Button>
              </span>
            </form>
          ))}
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="font-medium">Audit log — customer.created (last 20)</h2>
        <ul data-testid="audit-tail" className="space-y-1 text-sm">
          {recentAudit.length === 0 ? (
            <li className="text-muted-foreground">No customers created yet.</li>
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
    </div>
  );
};

export default InspectorPage;
