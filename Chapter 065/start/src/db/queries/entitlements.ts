import 'server-only';

import type { PlanSlug } from '@/lib/billing/projection';

// The entitlement read + decision table. These live in db/queries/, NOT lib/billing/
// (the ch064 L6 placement contract): the billing seam is Stripe calls + the gate;
// the entitlement read and the access decision are data-layer reads.

// The full row shape the inspector + panel render. S3 replaces this alias with
// PlanEntitlement = planEntitlements.$inferSelect once the columns land; until then it
// is spelled out here so the provided read path compiles against the PK-only table.
export type EntitlementRow = {
  organizationId: string;
  plan: PlanSlug;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
  subscriptionId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  seats: number;
  lastEventAt: Date | null;
  updatedAt: Date;
};

// Read the active org's entitlement row.
//
// TODO(L4) — getEntitlement(orgId): React.cache + tenantDb findFirst, throw on missing
// (the provisioning invariant). For now return a hard-coded `free` placeholder so the
// inspector renders without the columns existing yet.
export const getEntitlement = async (
  orgId: string,
): Promise<EntitlementRow> => ({
  organizationId: orgId,
  plan: 'free',
  status: 'active',
  subscriptionId: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  seats: 1,
  lastEventAt: null,
  updatedAt: new Date(),
});

// The access decision table: which statuses grant access.
//
// TODO(L4) — hasActiveAccess: exhaustive switch (trialing|active|past_due → true;
// canceled|incomplete → false; never default). Returns false until S3 lands.
export const hasActiveAccess = (_e: EntitlementRow): boolean => false;
