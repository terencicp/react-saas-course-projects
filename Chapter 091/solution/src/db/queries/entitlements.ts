import 'server-only';

import { eq } from 'drizzle-orm';
import { cache } from 'react';

import { db } from '@/db';
import type { PlanEntitlement } from '@/db/schema';
import { planEntitlements } from '@/db/schema';

// The entitlement read + decision table. These live in db/queries/, NOT lib/billing/
// (the ch064 L6 placement contract): the billing seam is Stripe calls + the gate;
// the entitlement read and the access decision are data-layer reads.

// The full row shape is PlanEntitlement = planEntitlements.$inferSelect. The inspector
// and the panel name this through an EntitlementRow alias so the provided read path
// keeps compiling against the schema-derived type.
export type EntitlementRow = PlanEntitlement;

// Read the active org's entitlement row. React.cache dedupes the read across the
// inspector's Suspense-wrapped panels in one request. The org PK makes this exactly
// one row; a missing row is the provisioning invariant violated (every org gets a free
// row at creation / seed), so it throws rather than returning a null the gate would
// silently mis-read. Scoped by the org PK; the webhook runs as the BYPASSRLS superuser
// and getEntitlement reads on the inspector/gate path, so a direct db.query keyed by
// the PK is the scoped read (the tenantDb query surface covers member/invitation only).
export const getEntitlement = cache(
  async (orgId: string): Promise<PlanEntitlement> => {
    const row = await db.query.planEntitlements.findFirst({
      where: eq(planEntitlements.organizationId, orgId),
    });
    if (!row) {
      throw new Error(`plan_entitlements row missing for org: ${orgId}`);
    }
    return row;
  },
);

// The access decision table: which statuses grant access. trialing/active/past_due
// admit (past_due keeps access during the dunning grace); canceled/incomplete deny.
// The switch is exhaustive over the entitlement status enum — a never default makes a
// new status a tsc error, never a silent fall-through. The wind-down grace after a
// user cancels is carried by status:'active' + cancelAtPeriodEnd, not a canceled row.
export const hasActiveAccess = (e: PlanEntitlement): boolean => {
  switch (e.status) {
    case 'trialing':
    case 'active':
    case 'past_due':
      return true;
    case 'canceled':
    case 'incomplete':
      return false;
    default: {
      const _exhaustive: never = e.status;
      return _exhaustive;
    }
  }
};
