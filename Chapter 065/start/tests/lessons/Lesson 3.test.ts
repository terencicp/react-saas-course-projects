import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Lesson 3 — "Claim the event inside one transaction". Gates the post-verify
// orchestration at /api/webhooks/stripe: a first-seen event opens ONE db.transaction,
// claims the id against processed_events, and dispatches the work on the SAME tx; a
// replayed id (lost claim) is a 200 success, not a retry-inducing 4xx; the dispatch
// switch routes the three subscription events to their own handlers and answers any
// other type 200 from a default branch.
//
// Node env, no DOM: we drive the real POST handler over HTTP-shaped Request objects and
// call the real `dispatch` directly, observing the Response and the side effects the
// handlers leave on a recording `tx`. The handlers' downstream collaborators (projection,
// catalog, the Stripe SDK, the audit writer) are replaced with inert stand-ins so the
// suite needs no live Postgres and no network — the gate is the route's claim/dispatch
// orchestration and the switch's routing, not the lesson-4 handler bodies. Routing is
// read off the audit `action` each handler writes (a stable, observable output).
//
// Everything is inlined — only vitest, the stripe SDK (for signing fixtures), and the
// student's modules are imported.

// --- env boot ----------------------------------------------------------------
// The route's import graph reaches `@/env`, which validates required vars at import
// time. The lesson runner does not load `.env`, so seed the boundary's vars BEFORE the
// route (and its env module) is imported. The fixtures are signed with the same
// STRIPE_WEBHOOK_SECRET the route verifies against, so a genuine delivery verifies.
const WEBHOOK_SECRET = 'whsec_lesson3_test_secret_value_0000';

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

// --- module isolation --------------------------------------------------------
// The route's collaborators begin with `import 'server-only'`, whose guard throws
// outside a real Server Component. Neutralize it for the node test env.
vi.mock('server-only', () => ({}));

// A recording transaction handle. `insert`/`update` return a thenable builder whose
// terminal `.returning()` yields one row (so an UPDATE handler reaches its audit write
// instead of short-circuiting on a zero-row result). Every call is logged so we can see
// which write a handler performed.
type TxLog = { op: string };
const makeTx = () => {
  const ops: TxLog[] = [];
  const builder = {
    values: () => builder,
    set: () => builder,
    where: () => builder,
    onConflictDoUpdate: async () => [{ organizationId: 'org_test' }],
    onConflictDoNothing: async () => [],
    returning: async () => [{ organizationId: 'org_test' }],
  };
  return {
    ops,
    handle: {
      insert: () => {
        ops.push({ op: 'insert' });
        return builder;
      },
      update: () => {
        ops.push({ op: 'update' });
        return builder;
      },
      query: {
        organization: { findFirst: async () => ({ id: 'org_test' }) },
      },
    },
  };
};

// `db.transaction` hands the route the recording tx. `transactionCalls` counts how many
// transactions the route opens; `currentTx` is the active recording handle for the call
// under test, so we can prove the same handle reaches the claim, dispatch, and audit.
const transactionCalls: string[] = [];
let currentTx: ReturnType<typeof makeTx>;
vi.mock('@/db', () => ({
  db: {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      transactionCalls.push('open');
      currentTx = makeTx();
      return fn(currentTx.handle);
    },
  },
}));

// `claimEvent` is the dedup gate. The suite flips its return per case: `true` = a fresh
// claim (proceed to dispatch), `false` = a lost claim (a replay). `claimArgs` records
// the (tx, provider, eventId, eventType) the route passes, so FR1 can prove the route
// claims ON the transaction handle.
let claimResult = true;
const claimArgs: unknown[][] = [];
vi.mock('@/lib/webhooks/processed-events', () => ({
  claimEvent: async (...args: unknown[]) => {
    claimArgs.push(args);
    return claimResult;
  },
}));

// The audit writer is the per-handler fingerprint: onCheckoutCompleted writes
// 'billing.subscription.activated', onSubscriptionUpdated '…updated',
// onSubscriptionDeleted '…canceled'. The default switch arm writes none. Capturing the
// action (and the tx it rode) lets us read the dispatch routing off a real output.
const auditCalls: { tx: unknown; action: string }[] = [];
vi.mock('@/db/audit-log', () => ({
  logAudit: async (tx: unknown, event: { action: string }) => {
    auditCalls.push({ tx, action: event.action });
  },
}));

// The handlers' pure/IO collaborators, stubbed inert so the real handlers run to their
// audit write without live Postgres, a real catalog file race, or a Stripe round-trip.
vi.mock('@/lib/billing/catalog', () => ({
  loadCatalog: () => ({ planFromLookupKey: () => 'pro', lookupKeys: {} }),
}));
vi.mock('@/lib/billing/projection', () => ({
  subscriptionToEntitlement: () => ({
    plan: 'pro',
    status: 'active',
    subscriptionId: 'sub_test',
    currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    seats: 1,
  }),
}));
vi.mock('@/lib/billing/stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/stripe')>();
  return {
    ...actual,
    stripe: {
      ...actual.stripe,
      subscriptions: {
        retrieve: async () => ({ id: 'sub_test', metadata: {} }),
      },
    },
  };
});

// --- fixtures (inlined) ------------------------------------------------------
const makeEvent = (type: string, id: string): string =>
  JSON.stringify({
    id,
    object: 'event',
    type,
    created: 1_700_000_000,
    data: {
      object: {
        id: 'sub_test',
        customer: 'cus_test',
        subscription: 'sub_test',
        items: { data: [{ price: { lookup_key: 'course_pro_monthly' } }] },
        status: 'active',
        cancel_at_period_end: false,
        metadata: {},
      },
    },
  });

const CHECKOUT_EVENT = makeEvent(
  'checkout.session.completed',
  'evt_l3_checkout',
);

let POST: (request: Request) => Promise<Response>;
let dispatch: typeof import('@/lib/webhooks/stripe').dispatch;
let signValidHeader: (payload: string) => string;

const postSigned = (body: string): Promise<Response> =>
  POST(
    new Request('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'stripe-signature': signValidHeader(body),
        'content-type': 'application/json',
      },
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

  // Import the route + the real dispatch only after env + mocks are in place.
  ({ POST } = await import('@/app/api/webhooks/stripe/route'));
  ({ dispatch } = await import('@/lib/webhooks/stripe'));
});

beforeEach(() => {
  transactionCalls.length = 0;
  claimArgs.length = 0;
  auditCalls.length = 0;
  claimResult = true;
});

// FR1 — a first-seen verified event opens exactly one db.transaction and, on a fresh
// claim, dispatches with the SAME transaction handle the claim used.
describe('FR1: claim and dispatch share one transaction', () => {
  it('opens exactly one transaction for a verified, freshly-claimed event', async () => {
    claimResult = true;
    await postSigned(CHECKOUT_EVENT);

    expect(
      transactionCalls.length,
      'A verified event must do its claim + dispatch inside ONE db.transaction. ' +
        `Got ${transactionCalls.length} transaction(s) opened. Wrap the post-verify ` +
        'block in a single `await db.transaction(async (tx) => { ... })`.',
    ).toBe(1);
  });

  it('passes the transaction handle to claimEvent as (tx, "stripe", event.id)', async () => {
    claimResult = true;
    await postSigned(CHECKOUT_EVENT);

    const args = claimArgs[0] ?? [];
    expect(
      args[0],
      'claimEvent must run ON the transaction: pass `tx` as its first argument, not ' +
        'the global `db`. A claim outside the transaction does not roll back with the ' +
        'dispatch work.',
    ).toBe(currentTx.handle);
    expect(
      args[1],
      "claimEvent's provider argument must be the literal 'stripe'.",
    ).toBe('stripe');
    expect(
      args[2],
      "claimEvent must claim against the verified event's id (event.id).",
    ).toBe('evt_l3_checkout');
  });

  it('dispatches on the same transaction handle the claim used', async () => {
    claimResult = true;
    await postSigned(CHECKOUT_EVENT);

    expect(
      auditCalls.length,
      'A fresh claim must route through dispatch into a handler — no handler ran ' +
        '(no audit row was written). After a successful claimEvent, call ' +
        '`await dispatch(tx, event)`.',
    ).toBeGreaterThan(0);

    expect(
      auditCalls[0]?.tx,
      'dispatch must run on the SAME transaction handle as the claim. The handler the ' +
        "switch routed to wrote its audit row on a different tx — pass the route's `tx` " +
        'straight into `dispatch(tx, event)` so claim and work co-transact.',
    ).toBe(currentTx.handle);
  });
});

// FR2 — a lost claim (claimEvent → false) is a success: 200 { received: true,
// duplicate: true }, dispatch never runs, never a 4xx/5xx.
describe('FR2: a replayed event is a 200 success, not a retry', () => {
  it('answers 200 { received: true, duplicate: true } on a lost claim', async () => {
    claimResult = false;
    const response = await postSigned(CHECKOUT_EVENT);

    expect(
      response.status,
      'A duplicate delivery is a SUCCESS, answered 200 — never a 4xx/5xx (a 4xx tells ' +
        `Stripe to retry the same event forever). Got ${response.status}.`,
    ).toBe(200);

    const body = (await response.json()) as {
      received?: boolean;
      duplicate?: boolean;
    };
    expect(
      body,
      'A lost claim must answer body { received: true, duplicate: true } so the dedup ' +
        `hit is observable without a log dive. Got ${JSON.stringify(body)}.`,
    ).toEqual({ received: true, duplicate: true });
  });

  it('does no business work (no handler / audit row) on a lost claim', async () => {
    claimResult = false;
    await postSigned(CHECKOUT_EVENT);

    expect(
      auditCalls.length,
      'A replayed event must do NO business work: when claimEvent returns false, return ' +
        'from the transaction before calling dispatch. A handler ran anyway (an audit ' +
        `row was written ${auditCalls.length} time(s)).`,
    ).toBe(0);
  });

  it('still opens exactly one transaction on a lost claim', async () => {
    claimResult = false;
    await postSigned(CHECKOUT_EVENT);

    expect(
      transactionCalls.length,
      'The claim itself runs inside the transaction even on a replay (that is how the ' +
        'unique-conflict is observed). Exactly one transaction should open; got ' +
        `${transactionCalls.length}.`,
    ).toBe(1);
  });
});

// FR3 — a fresh claim (claimEvent → true) answers 200 { received: true,
// duplicate: false } and routes through dispatch.
describe('FR3: a fresh claim is accepted and dispatched', () => {
  it('answers 200 { received: true, duplicate: false } on a fresh claim', async () => {
    claimResult = true;
    const response = await postSigned(CHECKOUT_EVENT);

    expect(
      response.status,
      `A verified, freshly-claimed event answers 200. Got ${response.status}.`,
    ).toBe(200);

    const body = (await response.json()) as {
      received?: boolean;
      duplicate?: boolean;
    };
    expect(
      body,
      'A first-seen event must answer body { received: true, duplicate: false }. The ' +
        '`duplicate` flag is false only on the fresh-claim path. Got ' +
        `${JSON.stringify(body)}.`,
    ).toEqual({ received: true, duplicate: false });
  });

  it('routes the fresh claim through dispatch into a handler', async () => {
    claimResult = true;
    await postSigned(CHECKOUT_EVENT);

    expect(
      auditCalls.length,
      'A fresh claim must call dispatch, which routes checkout.session.completed to its ' +
        'handler. No handler ran. After the claim, call `await dispatch(tx, event)`.',
    ).toBeGreaterThan(0);
  });
});

// FR4 — dispatch routes each of the three subscription event types to its own handler,
// and an unsubscribed type hits the default branch and returns without error. Driven
// against the REAL dispatch; the per-handler audit action is the routing fingerprint.
describe('FR4: the dispatch switch routes each event type', () => {
  const event = (type: string) =>
    JSON.parse(makeEvent(type, `evt_l3_${type}`)) as never;
  const tx = makeTx();

  it('routes checkout.session.completed to the checkout handler', async () => {
    auditCalls.length = 0;
    await dispatch(tx.handle as never, event('checkout.session.completed'));
    expect(
      auditCalls.map((c) => c.action),
      "dispatch must route 'checkout.session.completed' to onCheckoutCompleted, which " +
        "audits 'billing.subscription.activated'.",
    ).toContain('billing.subscription.activated');
  });

  it('routes customer.subscription.updated to the update handler', async () => {
    auditCalls.length = 0;
    await dispatch(tx.handle as never, event('customer.subscription.updated'));
    expect(
      auditCalls.map((c) => c.action),
      "dispatch must route 'customer.subscription.updated' to onSubscriptionUpdated, " +
        "which audits 'billing.subscription.updated'.",
    ).toContain('billing.subscription.updated');
  });

  it('routes customer.subscription.deleted to the delete handler', async () => {
    auditCalls.length = 0;
    await dispatch(tx.handle as never, event('customer.subscription.deleted'));
    expect(
      auditCalls.map((c) => c.action),
      "dispatch must route 'customer.subscription.deleted' to onSubscriptionDeleted, " +
        "which audits 'billing.subscription.canceled'.",
    ).toContain('billing.subscription.canceled');
  });

  it('sends an unsubscribed type to the default branch without error or handler call', async () => {
    auditCalls.length = 0;
    await expect(
      dispatch(tx.handle as never, event('invoice.payment_succeeded')),
      'An event type the app never subscribed to must hit the `default` branch and ' +
        'return cleanly (it is dashboard noise, not an error). dispatch threw instead.',
    ).resolves.toBeUndefined();

    expect(
      auditCalls.length,
      'An unsubscribed event type must route to NO handler — the `default` arm logs ' +
        `'unhandled' and returns, writing no audit row. A handler fired (${auditCalls.length} ` +
        'audit row(s)).',
    ).toBe(0);
  });
});
