import 'server-only';

import type { PlanEntitlement } from '@/db/schema';
import { BillingError } from '@/lib/billing/billing-error';
import type { Catalog, PlanSlug } from '@/lib/billing/catalog';
import type { Stripe } from '@/lib/billing/stripe';

export type { PlanSlug };

// The writable half of a plan_entitlements row — the columns a projected
// Subscription maps onto, derived from the PlanEntitlement select type so the patch
// tracks the schema. organizationId/lastEventAt/updatedAt are owned by the handler
// (the org is resolved from metadata/Customer, the high-water mark from event.created,
// updatedAt by the column default), so they are not part of the projection.
export type EntitlementPatch = Pick<
  PlanEntitlement,
  | 'plan'
  | 'status'
  | 'subscriptionId'
  | 'currentPeriodEnd'
  | 'cancelAtPeriodEnd'
  | 'seats'
>;

// Map Stripe's wider Subscription.Status onto the entitlement's closed set. The
// statuses the column does not model (incomplete_expired/paused/unpaid) collapse to
// the nearest denying state — the access decision lives in hasActiveAccess, so a
// status outside the active band reads as no-access there.
const toEntitlementStatus = (
  status: Stripe.Subscription.Status,
): EntitlementPatch['status'] => {
  switch (status) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
      return 'canceled';
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
      return 'incomplete';
  }
};

// The pure projection: a Stripe Subscription → the entitlement columns. No DB, no SDK
// call — the handler retrieves/receives the Subscription and the catalog, this maps.
// current_period_end / quantity are read from the subscription ITEM (sub.items.data[0]),
// never the Subscription root (the root field is gone since basil, still on the item in
// dahlia). An unknown lookup_key is a hard failure (BillingError('unknown_plan')) so the
// handler 500s and Stripe retries rather than silently provisioning the wrong tier.
export const subscriptionToEntitlement = (
  sub: Stripe.Subscription,
  catalog: Catalog,
): EntitlementPatch => {
  const item = sub.items.data[0];
  if (!item) {
    throw new BillingError(
      'unknown_plan',
      `subscription ${sub.id} has no items`,
    );
  }
  const plan = catalog.planFromLookupKey(item.price.lookup_key);
  if (plan === null) {
    throw new BillingError('unknown_plan', item.price.lookup_key ?? 'null');
  }

  return {
    plan,
    status: toEntitlementStatus(sub.status),
    subscriptionId: sub.id,
    currentPeriodEnd: new Date(item.current_period_end * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    seats: item.quantity ?? 1,
  };
};
