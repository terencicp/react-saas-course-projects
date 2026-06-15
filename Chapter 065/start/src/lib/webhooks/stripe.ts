import 'server-only';

import type { Transaction } from '@/db';
import type { Stripe } from '@/lib/billing/stripe';
import { logger } from '@/lib/logger';

const log = logger.child({ seam: 'webhook.stripe' });

// The dispatch layer: the verified+claimed event is routed to a handler inside the
// route's db.transaction. Every DB call here rides `tx`, never the global db.
//
// TODO(L3) — exhaustive dispatch switch: 'checkout.session.completed' →
// onCheckoutCompleted, 'customer.subscription.updated' → onSubscriptionUpdated,
// 'customer.subscription.deleted' → onSubscriptionDeleted, default → log 'unhandled'.
export const dispatch = async (
  _tx: Transaction,
  event: Stripe.Event,
): Promise<void> => {
  log.info({ eventId: event.id, eventType: event.type }, 'unhandled');
};

// The reverse lookup: the org that owns a Stripe Customer (the safety net when
// metadata is absent in S3, the cross-check source in S5).
//
// TODO(L4) — read organization.id WHERE stripeCustomerId = ?; throw
// BillingError('unknown_customer') when no org owns the Customer.
export const resolveOrgIdFromCustomer = async (
  _tx: Transaction,
  _stripeCustomerId: string,
): Promise<string> => {
  throw new Error('not implemented');
};

// checkout.session.completed: the order just paid. Retrieve the Subscription ONCE (the
// single allowed stripe.* reach inside a handler), resolve the org, UPSERT the
// projection onto the org PK, and write an audit row — all on `tx`.
//
// TODO(L4) — onCheckoutCompleted (one subscriptions.retrieve), UPSERT the projection
// with lastEventAt = new Date(event.created * 1000), logAudit per transition.
// TODO(L6) — cross-check sub.metadata.organization_id against the Customer-owned org.
export const onCheckoutCompleted = async (
  _tx: Transaction,
  _event: Stripe.Event,
): Promise<void> => {
  throw new Error('not implemented');
};

// customer.subscription.updated: the payload IS the full Subscription — do NOT re-fetch.
// Project it and UPDATE the existing row, the ordering predicate in the WHERE.
//
// TODO(L4) — onSubscriptionUpdated (no re-fetch), ordering predicate in the UPDATE
// WHERE, logAudit only on a non-zero result (a zero-row result is the stale no-op).
export const onSubscriptionUpdated = async (
  _tx: Transaction,
  _event: Stripe.Event,
): Promise<void> => {
  throw new Error('not implemented');
};

// customer.subscription.deleted: wind the row back to free and null the subscription
// pointer, same ordering predicate in the WHERE.
//
// TODO(L4) — onSubscriptionDeleted to plan:'free'/status:'canceled', ordering predicate
// in the UPDATE WHERE, logAudit on a non-zero result.
export const onSubscriptionDeleted = async (
  _tx: Transaction,
  _event: Stripe.Event,
): Promise<void> => {
  throw new Error('not implemented');
};
