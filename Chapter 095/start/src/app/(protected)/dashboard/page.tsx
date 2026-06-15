import { listInvoicesWithCustomer } from '@/db/queries/invoices-with-customer';
import { listMembers } from '@/db/queries/members';
import { getOrganization } from '@/db/queries/organizations';
import { requireOrgUser } from '@/lib/auth';

// The dashboard.
//
// SEEDED AUDIT DEFECT #5 (finding 5, L6) — RSC waterfall (094 L6): the four reads
// below `await` SEQUENTIALLY — user → org → invoices → members — even though
// `invoices` and `members` have no dependency on each other. Each await blocks the
// next, so the page takes the sum of all four round-trips when only the sum of three
// is reachable. It renders correct data, just slowly (visible as a staircase in a
// DevTools/Sentry trace). The documented fix (NOT applied — this is a documentation
// finding) parallelizes the independent invoices + members pair only; user → org
// stays sequential (the orgId comes from the user). See findings/005-rsc-waterfall.md.
const DashboardPage = async () => {
  // user → org is a genuine dependency: the orgId comes from the session.
  const { user, orgId } = await requireOrgUser();
  const org = await getOrganization(orgId);

  // SEEDED #5: these two are independent but awaited sequentially (the waterfall).
  const invoices = await listInvoicesWithCustomer({ orgId });
  const members = await listMembers(orgId);

  return (
    <section data-testid="dashboard" className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">{org.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Signed in as {user.email}
      </p>

      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        <div data-testid="dashboard-members">
          <h2 className="text-sm font-medium">Team ({members.length})</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {members.map((m) => (
              <li key={m.id}>
                {m.user?.email} — {m.role}
              </li>
            ))}
          </ul>
        </div>

        <div data-testid="dashboard-invoices">
          <h2 className="text-sm font-medium">
            Recent invoices ({invoices.length})
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {invoices.slice(0, 8).map((invoice) => (
              <li key={invoice.id}>
                {invoice.number} —{' '}
                {invoice.customer?.name ?? invoice.customerName} —{' '}
                {invoice.status}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

export default DashboardPage;
