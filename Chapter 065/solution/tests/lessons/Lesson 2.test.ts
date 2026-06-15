import { beforeAll, describe, expect, it, vi } from 'vitest';

// Lesson 2 — "Verify before you parse". Gates the webhook trust boundary at
// /api/webhooks/stripe: a genuinely-signed delivery answers 200, a tampered or
// unsigned one answers 400 application/problem+json with no state mutated.
//
// Node env, no DOM: we drive the real POST route handler over HTTP-shaped Request
// objects and inspect the Response it returns. Everything the test needs is inlined
// — only vitest, the stripe SDK (the same one the route uses, for signing fixtures),
// and the student's route module are imported.

// --- env boot ----------------------------------------------------------------
// The route's import graph reaches `@/env`, which validates required vars at import
// time. The lesson runner does not load `.env`, so seed the handful the boundary
// needs BEFORE the route (and its env module) is imported. STRIPE_WEBHOOK_SECRET is
// the secret the route verifies against; the test signs its fixtures with the same
// value so a genuine delivery actually verifies.
const WEBHOOK_SECRET = 'whsec_lesson2_test_secret_value_0000';

const ENV_DEFAULTS: Record<string, string> = {
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/app',
  DATABASE_URL_UNPOOLED: 'postgres://postgres:postgres@localhost:5432/app',
  SEED: '1',
  BETTER_AUTH_SECRET: 'test-only-better-auth-secret-please-rotate-32b',
  BETTER_AUTH_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test_placeholder',
  EMAIL_FROM: 'Acme <verify@send.acme.example>',
  EMAIL_REPLY_TO: 'support@acme.example',
  INVITATION_SIGNING_SECRET: 'test-only-invitation-signing-secret-rotate=',
  STRIPE_SECRET_KEY: 'sk_test_placeholder_for_lesson_tests',
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  STRIPE_PORTAL_RETURN_URL: 'http://localhost:3000/inspector',
  APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_APP_NAME: 'Acme',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
};
for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  process.env[key] ??= value;
}

// --- transaction / dispatch isolation ---------------------------------------
// On a verified event the route opens db.transaction and runs claim + dispatch.
// We replace the DB and the two webhook collaborators with inert stand-ins so the
// suite needs no live Postgres and no Stripe network call: the gate under test is
// the route's verify→reject / verify→200 decision, not lesson-3/4 dispatch work.
//
// `transactionCalls` records every time the route opens a transaction — the lever
// for asserting that a REJECTED request mutates nothing (never opens one).
const transactionCalls: string[] = [];

// The route's collaborators begin with `import 'server-only'`, whose guard throws
// outside a real Server Component. Neutralize it for the node test env so the route
// and its real Stripe verification primitive can be imported.
vi.mock('server-only', () => ({}));

vi.mock('@/db', () => ({
  db: {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      transactionCalls.push('open');
      return fn({});
    },
  },
}));

vi.mock('@/lib/webhooks/processed-events', () => ({
  // Report a fresh claim so the route proceeds down its happy path.
  claimEvent: async () => true,
}));

vi.mock('@/lib/webhooks/stripe', () => ({
  // Inert dispatch: a verified event reaches here, does nothing, returns 200.
  dispatch: async () => undefined,
}));

// --- signing fixtures (inlined) ----------------------------------------------
// Produce a genuinely-signed `stripe-signature` header with the SDK's own test
// helper, against the same secret the route verifies with.
const EVENT_PAYLOAD = JSON.stringify({
  id: 'evt_lesson2_checkout',
  object: 'event',
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_lesson2' } },
});

let POST: (request: Request) => Promise<Response>;
let signValidHeader: (payload: string) => string;

const postTo = (
  body: string,
  headers: Record<string, string>,
): Promise<Response> =>
  POST(
    new Request('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      headers,
      body,
    }),
  );

beforeAll(async () => {
  const { default: Stripe } = await import('stripe');
  const sdk = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: '2026-05-27.dahlia',
  });
  signValidHeader = (payload) =>
    sdk.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });

  // Import the route only after env + mocks are in place.
  ({ POST } = await import('@/app/api/webhooks/stripe/route'));
});

// FR1 — a genuinely-signed checkout.session.completed answers 200.
describe('FR1: a verified Stripe delivery is accepted', () => {
  it('answers 200 to a body carrying a valid stripe-signature', async () => {
    transactionCalls.length = 0;
    const response = await postTo(EVENT_PAYLOAD, {
      'stripe-signature': signValidHeader(EVENT_PAYLOAD),
      'content-type': 'application/json',
    });

    expect(
      response.status,
      'A correctly-signed webhook must verify and answer 200. Got ' +
        `${response.status}. Check the raw body is read once via request.text() ` +
        'and passed to stripe.webhooks.constructEvent before any 400 branch.',
    ).toBe(200);
  });
});

// FR2 — a tampered signature answers 400 application/problem+json,
// title 'invalid_signature', with no body parsed beyond verification.
describe('FR2: a tampered signature is rejected', () => {
  it('answers 400 problem+json with title invalid_signature', async () => {
    const tampered = `${signValidHeader(EVENT_PAYLOAD)}tampered`;
    const response = await postTo(EVENT_PAYLOAD, {
      'stripe-signature': tampered,
      'content-type': 'application/json',
    });

    expect(
      response.status,
      'A failed signature verification must answer 400 (terminal to Stripe), ' +
        `not ${response.status}. Catch StripeSignatureVerificationError and return ` +
        'problemJson(400, ...).',
    ).toBe(400);

    expect(
      response.headers.get('content-type'),
      'A rejection must be RFC 9457 problem+json — return via problemJson(), which ' +
        'sets content-type: application/problem+json.',
    ).toBe('application/problem+json');

    const body = (await response.json()) as { title?: string };
    expect(
      body.title,
      "The problem document's title must be the machine token 'invalid_signature', " +
        `got ${JSON.stringify(body.title)}.`,
    ).toBe('invalid_signature');
  });
});

// FR3 — a POST with no stripe-signature header gets the SAME 400 invalid_signature.
describe('FR3: a request with no stripe-signature header is rejected', () => {
  it('answers the same 400 problem+json invalid_signature', async () => {
    const response = await postTo(EVENT_PAYLOAD, {
      'content-type': 'application/json',
    });

    expect(
      response.status,
      'A missing stripe-signature header is the SAME answer as a bad one: 400, ' +
        `not ${response.status}. Null-check the header before constructEvent.`,
    ).toBe(400);

    expect(
      response.headers.get('content-type'),
      'A missing-header rejection uses the identical problem+json shape as a bad ' +
        'signature.',
    ).toBe('application/problem+json');

    const body = (await response.json()) as { title?: string };
    expect(
      body.title,
      "A null signature header must yield title 'invalid_signature' — the signature " +
        `is the contract; only the log disposition differs. Got ${JSON.stringify(body.title)}.`,
    ).toBe('invalid_signature');
  });
});

// FR4 — a rejected request carries no business effect: it never opens a
// transaction, so no processed_events row (or any state) is written.
describe('FR4: a rejected request mutates no state', () => {
  it('opens no database transaction on a tampered signature', async () => {
    transactionCalls.length = 0;
    await postTo(EVENT_PAYLOAD, {
      'stripe-signature': `${signValidHeader(EVENT_PAYLOAD)}tampered`,
      'content-type': 'application/json',
    });

    expect(
      transactionCalls.length,
      'A forged delivery must be rejected BEFORE any state change — the claim and ' +
        'dispatch (which write processed_events) live inside db.transaction, and a ' +
        '400 path must never reach it. Verify the signature before opening the ' +
        'transaction.',
    ).toBe(0);
  });

  it('opens no database transaction on a missing signature header', async () => {
    transactionCalls.length = 0;
    await postTo(EVENT_PAYLOAD, { 'content-type': 'application/json' });

    expect(
      transactionCalls.length,
      'A request with no stripe-signature must short-circuit to 400 before opening ' +
        'a transaction — nothing attacker-controlled may touch the database.',
    ).toBe(0);
  });
});
