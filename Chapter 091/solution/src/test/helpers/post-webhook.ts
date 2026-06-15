import { POST } from '@/app/api/webhooks/stripe/route';
import { env } from '@/env';
import type { Stripe } from '@/lib/billing/stripe';
import { stripe } from '@/lib/billing/stripe';

type PostWebhookOptions = {
  // Corrupt one character of the signature so the route's constructEvent rejects it
  // (the fail-closed front door test).
  tamperSignature?: boolean;
  // Override the signing secret (defaults to env.STRIPE_WEBHOOK_SECRET — the same value
  // the route verifies against, so a default-signed payload verifies).
  secret?: string;
};

// Drive a Stripe event through the REAL route handler. The event is serialized to a
// string ONCE, that exact string is both signed and used as the Request body (a second
// JSON.stringify would produce different bytes and break verification), and the signed
// header is attached. The route's db.transaction runs on the mocked @/db → the
// testTxContext-current tx (set by the surrounding withRollback body).
//
// Signing uses stripe.webhooks.generateTestHeaderString — the real SDK method (kept
// real by the integration setup's narrow mock), never a hand-rolled HMAC — so the
// route's real constructEvent verifies it.
export const postWebhook = async (
  event: Stripe.Event,
  opts: PostWebhookOptions = {},
): Promise<Response> => {
  const body = JSON.stringify(event);
  const secret = opts.secret ?? env.STRIPE_WEBHOOK_SECRET;

  let signature = stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret,
  });

  if (opts.tamperSignature) {
    // Flip one character of the v1= signature hex so verification fails while the
    // header stays well-formed (the rejection is the signature check, not a parse).
    const last = signature.at(-1) ?? '0';
    const flipped = last === '0' ? '1' : '0';
    signature = signature.slice(0, -1) + flipped;
  }

  const request = new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature,
    },
    body,
  });

  return POST(request);
};
