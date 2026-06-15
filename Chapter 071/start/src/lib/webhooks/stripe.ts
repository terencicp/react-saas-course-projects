import 'server-only';

import { and, eq, isNull, lt, or } from 'drizzle-orm';

import type { Transaction } from '@/db';
import { logAudit } from '@/db/audit-log';
import { planEntitlements } from '@/db/schema';
import { organization } from '@/db/schema/auth';
import { BillingError } from '@/lib/billing/billing-error';
import { loadCatalog } from '@/lib/billing/catalog';
import { subscriptionToEntitlement } from '@/lib/billing/projection';
import type { Stripe } from '@/lib/billing/stripe';
import { stripe } from '@/lib/billing/stripe';
import { logger } from '@/lib/logger';

const log = logger.child({ seam: 'webhook.stripe' });

// The dispatch layer: the verified+claimed event is routed to a handler inside the
// route's db.transaction. Every DB call here rides `tx`, never the global db. The
// switch is exhaustive over the three subscription events the app subscribes to; a
// `default` answers any other type 200 (a dashboard misconfiguration sends events the
// app never wanted — refusing them is noise; logging and returning is the right reply).
export const dispatch = async (
  tx: Transaction,
  event: Stripe.Event,
): Promise<void> => {
  switch (event.type) {
    case 'checkout.session.completed':
      await onCheckoutCompleted(tx, event);
      break;
    case 'customer.subscription.updated':
      await onSubscriptionUpdated(tx, event);
      break;
    case 'customer.subscription.deleted':
      await onSubscriptionDeleted(tx, event);
      break;
    default:
      log.info({ eventId: event.id, eventType: event.type }, 'unhandled');
      return;
  }
  log.info({ eventId: event.id, eventType: event.type }, 'dispatched');
};

// The reverse lookup: the org that owns a Stripe Customer (the safety net when
// metadata is absent in S3, the cross-check source in S5). An event for a Customer the
// app never created resolves to no org → throw, so the transaction rolls back and the
// route 500s (Stripe surfaces the failure) rather than silently provisioning.
export const resolveOrgIdFromCustomer = async (
  tx: Transaction,
  stripeCustomerId: string,
): Promise<string> => {
  const org = await tx.query.organization.findFirst({
    where: eq(organization.stripeCustomerId, stripeCustomerId),
  });
  if (!org) {
    throw new BillingError(
      'unknown_customer',
      `no org owns Stripe customer ${stripeCustomerId}`,
    );
  }
  return org.id;
};

const asId = (value: string | { id: string } | null): string | null => {
  if (value === null) {
    return null;
  }
  return typeof value === 'string' ? value : value.id;
};

// checkout.session.completed: the order just paid. The Session carries ids, not the
// expanded objects, so we fetch the Subscription ONCE — the single allowed stripe.*
// reach inside a handler (the carve-out from the no-IO-in-transaction rule). The
// carry-channel organization_id lands on the SUBSCRIPTION's metadata (subscription_data
// is a create-only Checkout param, absent from the retrieved Session), so it is read
// off sub.metadata, never session.subscription_data. The row may not exist yet, so this
// UPSERTs the projection onto the org PK; the audit row co-transacts.
//
// Tenancy hardening (S5): the org is resolved from the Customer the app actually
// created (resolveOrgIdFromCustomer — the authoritative source, since the app owns the
// Customer↔org mapping), then cross-checked against the carry-channel metadata. A
// forged organization_id in metadata cannot win: the two sources must AGREE, and a
// mismatch is a hard failure (log + throw → the transaction rolls back, the route 500s,
// Stripe surfaces it) rather than picking a side. An unknown Customer already throws
// BillingError('unknown_customer') inside resolveOrgIdFromCustomer.
export const onCheckoutCompleted = async (
  tx: Transaction,
  event: Stripe.Event,
): Promise<void> => {
  const session = event.data.object as Stripe.Checkout.Session;
  const customerId = asId(session.customer);
  const subscriptionId = asId(session.subscription);
  if (!customerId || !subscriptionId) {
    log.warn({ eventId: event.id }, 'checkout_missing_ids');
    return;
  }

  // The one allowed reach: retrieve the Subscription the Session points at.
  const sub = await stripe.subscriptions.retrieve(subscriptionId);

  // The Customer-owned org is authoritative: the app created the Customer and stored
  // the mapping, so this cannot be forged through the event payload. Throws
  // BillingError('unknown_customer') for a Customer the app never created.
  const orgId = await resolveOrgIdFromCustomer(tx, customerId);

  // Cross-check the carry-channel metadata against the Customer-owned org. They must
  // agree; a present-but-mismatched organization_id is a forged tenancy attempt — log
  // and throw so the transaction rolls back and nothing is written to the wrong tenant.
  const claimedOrgId = sub.metadata.organization_id;
  if (claimedOrgId && claimedOrgId !== orgId) {
    log.warn(
      { eventId: event.id, orgId, claimedOrgId, customerId },
      'metadata_org_mismatch',
    );
    throw new BillingError(
      'unknown_customer',
      `metadata organization_id ${claimedOrgId} does not own customer ${customerId}`,
    );
  }

  const patch = subscriptionToEntitlement(sub, loadCatalog());
  const eventAt = new Date(event.created * 1000);

  await tx
    .insert(planEntitlements)
    .values({ organizationId: orgId, ...patch, lastEventAt: eventAt })
    .onConflictDoUpdate({
      target: planEntitlements.organizationId,
      set: { ...patch, lastEventAt: eventAt },
    });

  await logAudit(tx, {
    organizationId: orgId,
    actorUserId: null,
    action: 'billing.subscription.activated',
    subjectType: 'subscription',
    subjectId: sub.id,
    payload: { plan: patch.plan },
  });
  log.info(
    { eventId: event.id, orgId, plan: patch.plan },
    'checkout_completed',
  );
};

// customer.subscription.updated: the payload IS the full Subscription — do NOT re-fetch
// (re-fetching is the copied-Checkout bug). Project it and UPDATE the existing row,
// with the ordering predicate (lastEventAt < event.created) in the WHERE so a stale
// event silently no-ops under the row lock; the high-water mark advances in the same
// .set(...). The org is resolved from the row's own subscriptionId (no metadata trust
// outside checkout). The audit write fires only on a non-zero result.
export const onSubscriptionUpdated = async (
  tx: Transaction,
  event: Stripe.Event,
): Promise<void> => {
  const sub = event.data.object as Stripe.Subscription;
  const patch = subscriptionToEntitlement(sub, loadCatalog());
  const eventAt = new Date(event.created * 1000);

  const updated = await tx
    .update(planEntitlements)
    .set({ ...patch, lastEventAt: eventAt })
    .where(
      and(
        eq(planEntitlements.subscriptionId, sub.id),
        or(
          isNull(planEntitlements.lastEventAt),
          lt(planEntitlements.lastEventAt, eventAt),
        ),
      ),
    )
    .returning({ organizationId: planEntitlements.organizationId });

  const row = updated[0];
  if (!row) {
    log.info({ eventId: event.id, subscriptionId: sub.id }, 'stale_ordering');
    return;
  }

  await logAudit(tx, {
    organizationId: row.organizationId,
    actorUserId: null,
    action: 'billing.subscription.updated',
    subjectType: 'subscription',
    subjectId: sub.id,
    payload: { plan: patch.plan, status: patch.status },
  });
  log.info(
    { eventId: event.id, orgId: row.organizationId, plan: patch.plan },
    'subscription_updated',
  );

  // TODO(L4) — past-due path: on patch.status === 'past_due', read the org's owner user ids inside `tx` and push an org.billing.past_due descriptor onto the closure-captured pendingDispatches array route.ts dispatches after commit
};

// customer.subscription.deleted: the subscription ended. Wind the row back to free and
// null the subscription pointer, same ordering predicate in the WHERE (a stale delete
// must not regress a row a newer event already advanced). The org is resolved from the
// row's subscriptionId; the audit row fires only on a non-zero result.
export const onSubscriptionDeleted = async (
  tx: Transaction,
  event: Stripe.Event,
): Promise<void> => {
  const sub = event.data.object as Stripe.Subscription;
  const eventAt = new Date(event.created * 1000);

  const updated = await tx
    .update(planEntitlements)
    .set({
      plan: 'free',
      status: 'canceled',
      subscriptionId: null,
      lastEventAt: eventAt,
    })
    .where(
      and(
        eq(planEntitlements.subscriptionId, sub.id),
        or(
          isNull(planEntitlements.lastEventAt),
          lt(planEntitlements.lastEventAt, eventAt),
        ),
      ),
    )
    .returning({ organizationId: planEntitlements.organizationId });

  const row = updated[0];
  if (!row) {
    log.info({ eventId: event.id, subscriptionId: sub.id }, 'stale_ordering');
    return;
  }

  await logAudit(tx, {
    organizationId: row.organizationId,
    actorUserId: null,
    action: 'billing.subscription.canceled',
    subjectType: 'subscription',
    subjectId: sub.id,
    payload: { plan: 'free' },
  });
  log.info(
    { eventId: event.id, orgId: row.organizationId },
    'subscription_deleted',
  );
};
