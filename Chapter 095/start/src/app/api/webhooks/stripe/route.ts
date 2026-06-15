import { db } from '@/db';
import { env } from '@/env';
import { stripe } from '@/lib/billing/stripe';
import { logger } from '@/lib/logger';
import { problemJson } from '@/lib/problem';
import { claimEvent } from '@/lib/webhooks/processed-events';
import { dispatch } from '@/lib/webhooks/stripe';

// The Stripe webhook ingress. Route handlers run on the Node.js runtime by default
// in Next 16 (which is what the Stripe SDK needs — constructEvent is synchronous on
// Node), so no `runtime` segment config is set: with cacheComponents enabled, Next
// rejects an explicit `runtime` export, and Node is already the default here.

const log = logger.child({ seam: 'webhook.stripe' });

// The trust boundary: read the raw body exactly once, verify the signature against
// the endpoint secret, and only then trust the event. A missing header and a bad
// signature are the SAME answer — a 400 problem+json with no body echo — so Stripe
// treats the delivery as terminal (a 4xx is not retried) and nothing leaks.
//
// TODO(L4) — recover the request-correlation id header and open a runWithContext scope:
// the proxy scope does NOT propagate into route handlers, so this handler must recover
// the request-id header (or mint its own) and open its own runWithContext scope so every
// log line here carries the requestId mixin and joins its Sentry event. See
// findings/003-missing-correlation-id.md.
export const POST = async (request: Request): Promise<Response> => {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  // SEEDED AUDIT DEFECT #2 (finding 2, L4) — structured-log secret leak (092 L3): the
  // logger has no scrubbing seam (lib/logger.ts), so serializing the full request header
  // set here prints the `stripe-signature` signing material in the clear. A webhook
  // replay then logs a live secret — the 3am-rule violation. The documented + wired fix
  // (slice S3) is the single redact seam in lib/logger.ts plus logging only the
  // intentional fields. See findings/002-log-secret-leak.md.
  log.info(
    { headers: Object.fromEntries(request.headers) },
    'request_received',
  );

  if (signature === null) {
    log.warn('missing_header');
    return problemJson(400, 'invalid_signature');
  }

  let event: ReturnType<typeof stripe.webhooks.constructEvent>;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    if (error instanceof stripe.errors.StripeSignatureVerificationError) {
      log.warn('invalid_signature');
      return problemJson(400, 'invalid_signature');
    }
    throw error;
  }

  log.info({ eventId: event.id, eventType: event.type }, 'verified');

  // Verify → claim → mutate in ONE transaction: the claim and every handler write
  // share `tx`, so a crash mid-handler rolls back both — a replayed event id can
  // never mutate twice and a failed dispatch leaves no half-claimed row.
  let duplicate = false;
  await db.transaction(async (tx) => {
    const claimed = await claimEvent(tx, 'stripe', event.id, event.type);
    if (!claimed) {
      // A lost claim is a replay: log it and return without mutating. The route
      // still answers 200 below — a duplicate is a success, not a 4xx/5xx (a 4xx
      // would tell Stripe to retry the same event forever).
      duplicate = true;
      log.info({ eventId: event.id }, 'duplicate');
      return;
    }
    log.info({ eventId: event.id }, 'claimed');
    await dispatch(tx, event);
  });

  return Response.json({ received: true, duplicate }, { status: 200 });
};
