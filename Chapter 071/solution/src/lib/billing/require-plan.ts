import 'server-only';

import { getEntitlement, hasActiveAccess } from '@/db/queries/entitlements';
import { requireOrgUser } from '@/lib/auth';
import { BillingError } from '@/lib/billing/billing-error';
import type { PlanSlug } from '@/lib/billing/catalog';

// The tier order, free < pro < team. A higher tier admits a lower-tier gate, so the
// gate compares ranks rather than equality. `satisfies` keeps the map exhaustive over
// PlanSlug — a new tier without a rank is a tsc error.
const PLAN_RANK = { free: 0, pro: 1, team: 2 } as const satisfies Record<
  PlanSlug,
  number
>;

// The load-bearing Server-Component gate. `import 'server-only'` (NOT 'use server') —
// it is called from server components, never client-callable. A failure throws a
// BillingError, which the segment error.tsx catches and renders as the upgrade
// fallback; the gate is fail-closed (a thrown error inside the check is a refusal).
//
// Two distinct refusals carry distinct codes: an inactive entitlement throws
// 'no_access', a too-low tier throws 'plan_required'. error.tsx switches on the code to
// render the right message.
export const requirePlan = async (planSlug: 'pro' | 'team'): Promise<void> => {
  const { orgId } = await requireOrgUser();
  const e = await getEntitlement(orgId);

  if (!hasActiveAccess(e)) {
    throw new BillingError(
      'no_access',
      'Your subscription is no longer active.',
    );
  }

  if (PLAN_RANK[e.plan] < PLAN_RANK[planSlug]) {
    throw new BillingError(
      'plan_required',
      `This area requires the ${planSlug} plan.`,
    );
  }
};
