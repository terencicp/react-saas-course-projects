import { Suspense } from 'react';

import { OrgSwitcher } from '@/app/(protected)/dashboard/org-switcher';
import { ActingUserSwitcher } from '@/app/(protected)/inspector/_components/acting-user-switcher';
import { AuditTail } from '@/app/(protected)/inspector/_components/audit-tail';
import { CheckoutButton } from '@/app/(protected)/inspector/_components/checkout-button';
import { DebugControls } from '@/app/(protected)/inspector/_components/debug-controls';
import { EntitlementPanel } from '@/app/(protected)/inspector/_components/entitlement-panel';
import { PortalButton } from '@/app/(protected)/inspector/_components/portal-button';
import { ProcessedEventsTail } from '@/app/(protected)/inspector/_components/processed-events-tail';
import { getInspectorContext } from '@/app/(protected)/inspector/_data';
import { Card } from '@/components/ui/card';

// The Stripe inspector: the verification surface for the webhook → entitlement work.
// Each panel is one bounded region with a data-testid. Request-time reads sit behind
// <Suspense>; the helpers are stubs at scaffold time and return empty/`free` data,
// never throw — the page renders deterministically against the seeded DB with no live
// Stripe.

const isDev = process.env.NODE_ENV !== 'production';

const Header = async () => {
  const { userId, orgId, orgName, stripeCustomerId, orgs, members } =
    await getInspectorContext();

  return (
    <Card
      data-testid="inspector-header"
      className="flex flex-wrap items-center justify-between gap-4 p-4"
    >
      <div>
        <p className="text-xs uppercase text-muted-foreground">Active org</p>
        <p className="text-lg font-semibold">{orgName}</p>
        <p className="text-xs text-muted-foreground">
          Customer:{' '}
          <span data-testid="stripe-customer-id" className="font-mono">
            {stripeCustomerId ?? 'null'}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CheckoutButton plan="pro" testId="checkout-pro-button" />
        <CheckoutButton plan="team" testId="checkout-team-button" />
        <PortalButton hasCustomer={stripeCustomerId !== null} />
        <OrgSwitcher orgs={orgs} activeOrgId={orgId} />
        {isDev && <ActingUserSwitcher users={members} activeUserId={userId} />}
      </div>
    </Card>
  );
};

const Entitlement = async () => {
  const { entitlement } = await getInspectorContext();
  return <EntitlementPanel entitlement={entitlement} />;
};

const Events = async () => {
  const { processedEvents } = await getInspectorContext();
  return <ProcessedEventsTail rows={processedEvents} />;
};

const Audit = async () => {
  const { auditLogs } = await getInspectorContext();
  return <AuditTail rows={auditLogs} />;
};

const InspectorPage = () => (
  <section
    data-testid="inspector-page"
    className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10"
  >
    <h1 className="text-2xl font-semibold">Stripe inspector</h1>

    <Suspense>
      <Header />
    </Suspense>

    <div className="grid gap-6 md:grid-cols-2">
      <Suspense>
        <Entitlement />
      </Suspense>
      <Suspense>
        <Events />
      </Suspense>
      <Suspense>
        <Audit />
      </Suspense>
      {isDev && <DebugControls />}
    </div>
  </section>
);

export default InspectorPage;
