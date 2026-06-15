import 'server-only';

import { findOrganization, findPlanEntitlement } from '@/server/store';
import type { Organization, PlanEntitlement } from '@/server/types';

// SaaS pattern #1 — the tenant-scoped data facade. Every read and write goes
// through `tenantDb(orgId)`, so the org boundary is enforced in ONE place instead
// of being re-derived (and occasionally forgotten) at every call site. In the
// DB-backed framing this wraps a Drizzle client bound to a `WHERE org_id = $1`
// row-level-security scope; here it scopes the in-memory store to one org.
//
// The seeded plan-label mutation bypasses this facade and writes the store
// directly — that dropped guarantee is one of finding 1's review red flags. The
// reference fix routes the write back through `tenantDb(orgId).update(...)`.

export type TenantDb = {
  query: {
    // The org record for this tenant, or undefined if it does not exist.
    organization: () => Organization | undefined;
    // The plan entitlement for this tenant, or undefined.
    planEntitlement: () => PlanEntitlement | undefined;
  };
  update: {
    // Patch the org's customer-facing plan label, scoped to this tenant.
    organizationPlanLabel: (planLabel: string) => Organization | undefined;
  };
};

export const tenantDb = (orgId: string): TenantDb => ({
  query: {
    organization: () => findOrganization(orgId),
    planEntitlement: () => findPlanEntitlement(orgId),
  },
  update: {
    organizationPlanLabel: (planLabel) => {
      const org = findOrganization(orgId);
      if (!org) {
        return undefined;
      }
      org.planLabel = planLabel;
      return org;
    },
  },
});
