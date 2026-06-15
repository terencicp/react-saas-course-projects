import type { Stripe } from '@/lib/billing/stripe';
import { fixtureSubscription } from '@/test/fixtures/stripe-subscription';

// Deterministic Stripe.Event factories. Each builds the exact envelope the route reads
// (event.id, event.type, event.created, event.data.object) plus a data.object the
// matching handler casts. ids and timestamps default to a module sequence + a fixed
// clock — never Math.random / crypto.randomUUID — so tests are reproducible and the
// signature the postWebhook helper produces is stable.
//
// The carry-channel organization_id is NOT on the Checkout.Session (it lands on the
// Subscription's metadata, since subscription_data is a create-only Checkout param
// absent from the retrieved Session). The checkout cross-check therefore reads
// sub.metadata.organization_id off the `subscriptions.retrieve`-returned Subscription —
// the test registers that Subscription (with its orgId) via registerSubscription.

let counter = 0;
const sequence = (): number => {
  counter += 1;
  return counter;
};

const defaultEventId = (): string => `evt_test_${Date.now()}_${sequence()}`;
const defaultCreated = (): number => Math.floor(Date.now() / 1000);

const envelope = <T>(
  type: Stripe.Event['type'],
  object: T,
  eventId: string,
  createdAt: number,
): Stripe.Event =>
  ({
    id: eventId,
    object: 'event',
    type,
    created: createdAt,
    api_version: '2026-05-27.dahlia',
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: { object },
  }) as unknown as Stripe.Event;

type CheckoutCompletedOptions = {
  orgId: string;
  customerId: string;
  subscriptionId: string;
  eventId?: string;
  createdAt?: number;
};

// checkout.session.completed: the Session carries ids, not expanded objects. The orgId
// here documents the tenancy intent; it must match the orgId on the registered
// fixtureSubscription's metadata (the handler resolves the org from the Customer and
// cross-checks the Subscription metadata, never the Session).
export const checkoutCompleted = ({
  customerId,
  subscriptionId,
  eventId = defaultEventId(),
  createdAt = defaultCreated(),
}: CheckoutCompletedOptions): Stripe.Event => {
  const session = {
    id: `cs_test_${sequence()}`,
    object: 'checkout.session',
    mode: 'subscription',
    status: 'complete',
    customer: customerId,
    subscription: subscriptionId,
  } as unknown as Stripe.Checkout.Session;

  return envelope('checkout.session.completed', session, eventId, createdAt);
};

type SubscriptionUpdatedOptions = {
  orgId?: string;
  subscriptionId: string;
  status: Stripe.Subscription.Status;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  lookupKey?: string;
  eventId?: string;
  createdAt?: number;
};

// customer.subscription.updated: the payload IS the full Subscription (the handler must
// NOT re-fetch). data.object is built via fixtureSubscription so the item-level fields
// the projection reads are present.
export const subscriptionUpdated = ({
  orgId,
  subscriptionId,
  status,
  currentPeriodEnd,
  cancelAtPeriodEnd,
  lookupKey,
  eventId = defaultEventId(),
  createdAt = defaultCreated(),
}: SubscriptionUpdatedOptions): Stripe.Event => {
  const sub = fixtureSubscription({
    id: subscriptionId,
    status,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    lookupKey,
    orgId,
  });
  return envelope('customer.subscription.updated', sub, eventId, createdAt);
};

type SubscriptionDeletedOptions = {
  subscriptionId: string;
  eventId?: string;
  createdAt?: number;
};

// customer.subscription.deleted: the payload is the (now-canceled) Subscription.
export const subscriptionDeleted = ({
  subscriptionId,
  eventId = defaultEventId(),
  createdAt = defaultCreated(),
}: SubscriptionDeletedOptions): Stripe.Event => {
  const sub = fixtureSubscription({
    id: subscriptionId,
    status: 'canceled',
  });
  return envelope('customer.subscription.deleted', sub, eventId, createdAt);
};
