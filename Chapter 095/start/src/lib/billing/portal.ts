'use server';

import { z } from 'zod';

import { getOrgWithOwnerEmail } from '@/db/queries/organizations';
import { env } from '@/env';
import { authedAction } from '@/lib/auth/authed-action';
import { BillingError } from '@/lib/billing/billing-error';
import { stripe } from '@/lib/billing/stripe';
import { err, ok, type Result } from '@/lib/result';

// 'use server' — the Portal client island imports and calls this. Opens a Stripe
// Billing Portal session for the org's Customer and returns its URL (the island opens
// it in a new tab). Plan changes and cancellation happen in the Portal, never via
// stripe.subscriptions.update from app code.
export const openPortal = authedAction(
  'admin',
  z.strictObject({ returnPath: z.string().optional() }),
  async ({ returnPath }, ctx): Promise<Result<{ url: string }>> => {
    const org = await getOrgWithOwnerEmail(ctx.orgId);

    // No Customer → no Portal to open. The inspector already disables the button when
    // stripeCustomerId is null, so this is belt-and-suspenders; the BillingError carries
    // the machine-readable distinction the Result's userMessage cannot.
    if (!org.stripeCustomerId) {
      const reason = new BillingError(
        'no_customer',
        'Start a Checkout to create a billing account first.',
      );
      return err('forbidden', reason.userMessage);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: returnPath ?? env.STRIPE_PORTAL_RETURN_URL,
    });

    return ok({ url: session.url });
  },
);
