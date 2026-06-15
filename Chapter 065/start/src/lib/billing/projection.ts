import 'server-only';

import type { Catalog, PlanSlug } from '@/lib/billing/catalog';
import type { Stripe } from '@/lib/billing/stripe';

export type { PlanSlug };

// The writable half of a plan_entitlements row — the columns a projected Subscription
// maps onto. organizationId/lastEventAt/updatedAt are owned by the handler, so they are
// not part of the projection.
//
// TODO(L4) — once plan_entitlements has its columns, derive this from the schema:
// Pick<PlanEntitlement, 'plan' | 'status' | 'subscriptionId' | 'currentPeriodEnd' |
// 'cancelAtPeriodEnd' | 'seats'> so the patch tracks the table.
export type EntitlementPatch = {
  plan: PlanSlug;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
  subscriptionId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  seats: number;
};

// The pure projection: a Stripe Subscription → the entitlement columns. No DB, no SDK
// call — the handler retrieves/receives the Subscription and the catalog, this maps.
//
// TODO(L4) — pure projection: lookup_key → plan (null → BillingError unknown_plan),
// status, current_period_end*1000, cancel_at_period_end, quantity.
export const subscriptionToEntitlement = (
  _sub: Stripe.Subscription,
  _catalog: Catalog,
): EntitlementPatch => {
  throw new Error('not implemented');
};
