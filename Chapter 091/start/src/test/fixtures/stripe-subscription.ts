import type { Stripe } from '@/lib/billing/stripe';

type FixtureSubscriptionOptions = {
  id: string;
  lookupKey?: string;
  status?: Stripe.Subscription.Status;
  // Unix seconds (the item-level current_period_end the SUT projection reads).
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  quantity?: number;
  // When given, lands on sub.metadata.organization_id — the carry-channel the SUT
  // cross-checks against the Customer-owned org in onCheckoutCompleted.
  orgId?: string;
};

// The Subscription the stubbed `stripe.subscriptions.retrieve` returns (registered
// per-test via stripe-retrieve-registry). The SUT projection reads ONLY:
//   - sub.items.data[0].price.lookup_key  (→ plan slug via the catalog)
//   - sub.items.data[0].current_period_end (the ITEM field, not the Subscription root —
//     the field moved off the root since basil; still on the item in dahlia)
//   - sub.items.data[0].quantity (→ seats)
//   - sub.status, sub.cancel_at_period_end
//   - sub.metadata.organization_id (the carry-channel)
// so only those are populated faithfully; the rest of the (very wide) Subscription type
// is filled minimally and the object is cast — the SUT never reads the other fields.
export const fixtureSubscription = ({
  id,
  lookupKey = 'course_pro_monthly',
  status = 'trialing',
  currentPeriodEnd = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  cancelAtPeriodEnd = false,
  quantity = 1,
  orgId,
}: FixtureSubscriptionOptions): Stripe.Subscription => {
  const item = {
    id: `si_${id}`,
    object: 'subscription_item',
    quantity,
    current_period_end: currentPeriodEnd,
    current_period_start: currentPeriodEnd - 60 * 60 * 24 * 30,
    price: {
      id: `price_${lookupKey}`,
      object: 'price',
      lookup_key: lookupKey,
      active: true,
    },
  } as unknown as Stripe.SubscriptionItem;

  return {
    id,
    object: 'subscription',
    status,
    cancel_at_period_end: cancelAtPeriodEnd,
    metadata: orgId ? { organization_id: orgId } : {},
    items: {
      object: 'list',
      data: [item],
      has_more: false,
      url: `/v1/subscription_items?subscription=${id}`,
    },
  } as unknown as Stripe.Subscription;
};
