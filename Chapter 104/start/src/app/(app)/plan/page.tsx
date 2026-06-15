import '@/lib/analytics/page-view-tracker';

import { SeatUsage } from '@/app/(app)/plan/seat-usage';
import { getPlanEntitlement } from '@/lib/plan/get-plan-entitlement';
import { renewalCountdownDays } from '@/lib/plan/renewal-countdown';
import { getSession } from '@/server/session';

const PlanPage = async () => {
  const session = await getSession();
  const entitlement = await getPlanEntitlement(session.orgId);

  if (!entitlement) {
    return (
      <div data-testid="plan-page" className="space-y-4">
        <h1 className="text-xl font-semibold">Plan</h1>
        <p className="text-sm text-muted-foreground">
          No plan entitlement found for this organization.
        </p>
      </div>
    );
  }

  const daysUntilRenewal = renewalCountdownDays(entitlement.renewsAt);

  return (
    <div data-testid="plan-page" className="space-y-4">
      <h1 className="text-xl font-semibold">Plan</h1>

      <section className="rounded-lg border p-4">
        <h2 className="text-sm font-medium text-muted-foreground">
          Current plan
        </h2>
        <p className="mt-1 text-lg font-semibold">{entitlement.plan}</p>
      </section>

      <SeatUsage
        seatsAllocated={entitlement.seatsAllocated}
        seatsUsed={entitlement.seatsUsed}
      />

      <section
        data-testid="renewal-countdown"
        className="rounded-lg border p-4"
      >
        <h2 className="text-sm font-medium text-muted-foreground">Renewal</h2>
        <p className="mt-1 text-lg font-semibold">
          {daysUntilRenewal} days until renewal
        </p>
      </section>
    </div>
  );
};

export default PlanPage;
