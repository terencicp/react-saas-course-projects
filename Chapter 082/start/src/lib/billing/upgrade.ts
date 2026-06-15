'use server';

import { z } from 'zod';

import {
  getOrgWithOwnerEmail,
  setStripeCustomerId,
} from '@/db/queries/organizations';
import { env } from '@/env';
import { authedAction } from '@/lib/auth/authed-action';
import { loadCatalog } from '@/lib/billing/catalog';
import { stripe } from '@/lib/billing/stripe';
import { err, ok, type Result } from '@/lib/result';

// 'use server' — the Checkout client island imports and calls this. Starts an upgrade
// by creating a Stripe Checkout Session and returns its hosted URL for a full browser
// navigation (the URL is on Stripe's domain). The webhook, not this action, writes the
// entitlement — this only opens the hosted Checkout.
export const upgrade = authedAction(
  'admin',
  z.strictObject({ planSlug: z.enum(['pro', 'team']) }),
  async ({ planSlug }, ctx): Promise<Result<{ url: string }>> => {
    const org = await getOrgWithOwnerEmail(ctx.orgId);

    // Ensure the Stripe Customer. The Stripe-side create happens BEFORE the local
    // stripeCustomerId UPDATE: an orphan-but-duplicate Customer on a failed retry is
    // fixable, a local pointer to a non-existent Customer is not. (Production hardening:
    // an idempotency key on customers.create would dedupe the retry orphan; named, not
    // built here.) The organization_id metadata is the carry-channel the webhook reads
    // back to resolve the tenant.
    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: org.ownerEmail,
        metadata: { organization_id: ctx.orgId },
      });
      customerId = customer.id;
      await setStripeCustomerId(ctx.orgId, customerId);
    }

    // Resolve the Price by lookup_key (never a hardcoded price_id — the catalog maps the
    // student's test-mode lookup_keys, rewritten by seed:stripe).
    const catalog = loadCatalog();
    const lookupKey = Object.keys(catalog.lookupKeys).find(
      (key) => catalog.lookupKeys[key] === planSlug,
    );
    if (!lookupKey) {
      return err('not_found', 'No price is configured for that plan.');
    }
    const prices = await stripe.prices.list({
      lookup_keys: [lookupKey],
      active: true,
      limit: 1,
    });
    const price = prices.data[0];
    if (!price) {
      return err('not_found', 'No price is configured for that plan.');
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: price.id, quantity: 1 }],
      subscription_data: {
        metadata: { organization_id: ctx.orgId },
        trial_period_days: 14,
      },
      payment_method_collection: 'always',
      allow_promotion_codes: false,
      success_url: `${env.APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.APP_URL}/inspector`,
    });

    if (!session.url) {
      return err('internal', 'Stripe did not return a Checkout URL.');
    }
    return ok({ url: session.url });
  },
);
