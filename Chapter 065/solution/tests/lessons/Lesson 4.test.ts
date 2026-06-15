import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Lesson 4 — "Project three events into one entitlement row". This gates the derived
// view: `plan_entitlements` is computed FROM Stripe events and read by every request,
// so the webhook is its only writer and a pure projection sits between Stripe's shape
// and the app's. Three handlers land the transitions — checkout UPSERTs `pro`, update
// refreshes, delete reverts to `free` — each carrying the `lastEventAt < eventAt`
// ordering predicate so an out-of-order delivery silently no-ops, plus a co-transacted
// audit row on every real transition. Two read helpers complete the seam:
// `getEntitlement` (the per-request row read) and `hasActiveAccess` (the decision table).
//
// Node env, no DOM. We call the REAL handlers and the REAL pure functions and observe
// the side effects they leave on a recording `tx` (the row values written, the audit
// `action`) plus the values the pure functions return/throw. The handlers' IO/pure
// collaborators (the Stripe SDK retrieve, the catalog file, the org lookup, the audit
// writer) are replaced with inert stand-ins so the suite needs no live Postgres and no
// network — the gate is the observable row + audit state after dispatch, never a call
// count or a function name.
//
// Everything is inlined — only vitest, the stripe SDK type-shaped fixtures, and the
// student's modules are imported.

// --- env boot ----------------------------------------------------------------
// The handlers' import graph reaches `@/env`, which validates required vars at import
// time. The lesson runner does not load `.env`, so seed the boundary's vars BEFORE the
// modules (and their env module) are imported.
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
  STRIPE_WEBHOOK_SECRET: 'whsec_lesson4_test_secret_value_0000',
  STRIPE_PORTAL_RETURN_URL: 'http://localhost:3000/inspector',
  APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_APP_NAME: 'Acme',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
};
for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  process.env[key] ??= value;
}

// --- module isolation --------------------------------------------------------
// The modules under test begin with `import 'server-only'`, whose guard throws outside
// a real Server Component. Neutralize it for the node test env.
vi.mock('server-only', () => ({}));

// --- recording transaction ---------------------------------------------------
// A `tx` handle that records what each handler writes and lets the suite control the
// row-count an UPDATE matched (so the stale-event no-op is observable). Each terminal
// op pushes a structured record onto `writes`.
//
//   tx.insert(table).values(v).onConflictDoUpdate({ set })   → records an UPSERT
//   tx.update(table).set(v).where(w).returning()             → records an UPDATE,
//                                                              returns `updateResult`
//
// `updateResult` is the row(s) the UPDATE's WHERE matched: one row = a live transition,
// `[]` = the ordering predicate (or subscriptionId) matched nothing — the honest no-op.
type Upsert = {
  op: 'upsert';
  values: Record<string, unknown>;
  set: Record<string, unknown>;
};
type Update = { op: 'update'; set: Record<string, unknown> };
type Write = Upsert | Update;

let updateResult: Array<{ organizationId: string }> = [
  { organizationId: 'org_test' },
];

const makeTx = () => {
  const writes: Write[] = [];
  const updateBuilder = () => {
    let captured: Record<string, unknown> = {};
    const builder = {
      set: (v: Record<string, unknown>) => {
        captured = v;
        return builder;
      },
      where: () => builder,
      returning: async () => {
        writes.push({ op: 'update', set: captured });
        return updateResult;
      },
    };
    return builder;
  };
  return {
    writes,
    handle: {
      insert: () => ({
        values: (v: Record<string, unknown>) => ({
          onConflictDoUpdate: async (cfg: { set: Record<string, unknown> }) => {
            writes.push({ op: 'upsert', values: v, set: cfg.set });
            return [];
          },
        }),
      }),
      update: () => updateBuilder(),
      query: {
        organization: {
          findFirst: async () => ({ id: 'org_test' }),
        },
        planEntitlements: {
          findFirst: async () => entitlementRow,
        },
      },
    },
  };
};

// --- @/db mock ---------------------------------------------------------------
// `getEntitlement` reads through the global `db` (NOT the tx). The suite flips
// `entitlementRow` per case: a row = present, `undefined` = the provisioning invariant
// violated (a missing row must throw).
let entitlementRow: Record<string, unknown> | undefined = {
  organizationId: 'org_test',
  plan: 'pro',
  status: 'active',
};
vi.mock('@/db', () => ({
  db: {
    query: {
      planEntitlements: {
        findFirst: async () => entitlementRow,
      },
    },
  },
}));

// The audit writer — the per-transition fingerprint. Capturing the action (and the tx
// it rode) lets us read each handler's audit behavior off a real output.
const auditCalls: { action: string }[] = [];
vi.mock('@/db/audit-log', () => ({
  logAudit: async (_tx: unknown, event: { action: string }) => {
    auditCalls.push({ action: event.action });
  },
}));

// The catalog maps the fixture lookup_key onto a plan. `course_pro_monthly` → 'pro';
// anything else → null (so the projection's unknown-key throw is reachable).
vi.mock('@/lib/billing/catalog', () => ({
  loadCatalog: () => ({
    planFromLookupKey: (key: string | null | undefined) =>
      key === 'course_pro_monthly' ? 'pro' : null,
    lookupKeys: { course_pro_monthly: 'pro' },
  }),
}));

// The single allowed reach inside onCheckoutCompleted: stripe.subscriptions.retrieve.
// Returns the expanded Subscription the Session only carries the id of.
const FIXTURE_PERIOD_UNIX = 1_800_000_000; // 2027-01-15T08:00:00Z
const makeSubscription = (over: Record<string, unknown> = {}) => ({
  id: 'sub_test',
  status: 'active',
  cancel_at_period_end: false,
  metadata: {},
  items: {
    data: [
      {
        price: { lookup_key: 'course_pro_monthly' },
        current_period_end: FIXTURE_PERIOD_UNIX,
        quantity: 1,
      },
    ],
  },
  ...over,
});
vi.mock('@/lib/billing/stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/stripe')>();
  return {
    ...actual,
    stripe: {
      ...actual.stripe,
      subscriptions: {
        retrieve: async () => makeSubscription(),
      },
    },
  };
});

// --- fixtures (inlined) ------------------------------------------------------
const CHECKOUT_CREATED_UNIX = 1_700_000_000; // 2023-11-14T22:13:20Z

const checkoutEvent = (created = CHECKOUT_CREATED_UNIX) =>
  ({
    id: 'evt_l4_checkout',
    object: 'event',
    type: 'checkout.session.completed',
    created,
    data: {
      object: { id: 'cs_test', customer: 'cus_test', subscription: 'sub_test' },
    },
  }) as never;

const subscriptionEvent = (
  type: string,
  over: Record<string, unknown> = {},
  created = CHECKOUT_CREATED_UNIX,
) =>
  ({
    id: `evt_l4_${type}`,
    object: 'event',
    type,
    created,
    data: { object: makeSubscription(over) },
  }) as never;

// --- modules under test (imported after env + mocks) -------------------------
let onCheckoutCompleted: typeof import('@/lib/webhooks/stripe').onCheckoutCompleted;
let onSubscriptionUpdated: typeof import('@/lib/webhooks/stripe').onSubscriptionUpdated;
let onSubscriptionDeleted: typeof import('@/lib/webhooks/stripe').onSubscriptionDeleted;
let subscriptionToEntitlement: typeof import('@/lib/billing/projection').subscriptionToEntitlement;
let getEntitlement: typeof import('@/db/queries/entitlements').getEntitlement;
let hasActiveAccess: typeof import('@/db/queries/entitlements').hasActiveAccess;

beforeAll(async () => {
  ({ onCheckoutCompleted, onSubscriptionUpdated, onSubscriptionDeleted } =
    await import('@/lib/webhooks/stripe'));
  ({ subscriptionToEntitlement } = await import('@/lib/billing/projection'));
  ({ getEntitlement, hasActiveAccess } = await import(
    '@/db/queries/entitlements'
  ));
});

beforeEach(() => {
  auditCalls.length = 0;
  updateResult = [{ organizationId: 'org_test' }];
  entitlementRow = {
    organizationId: 'org_test',
    plan: 'pro',
    status: 'active',
  };
});

// FR2 — checkout.session.completed flips the row to plan 'pro', populates
// subscriptionId + currentPeriodEnd, and stamps lastEventAt from event.created as a Date.
describe('FR2: checkout projects the row to pro with subscription + period + high-water mark', () => {
  it('UPSERTs plan "pro", the subscriptionId, and currentPeriodEnd onto the org row', async () => {
    const tx = makeTx();
    await onCheckoutCompleted(tx.handle as never, checkoutEvent());

    const upsert = tx.writes.find((w): w is Upsert => w.op === 'upsert');
    expect(
      upsert,
      'onCheckoutCompleted must write the projected row — the row may not exist yet, so ' +
        'UPSERT it onto the org PK (`tx.insert(planEntitlements).values(...).onConflictDoUpdate(...)`). ' +
        'No insert/upsert was performed.',
    ).toBeDefined();

    const written = { ...upsert?.values, ...upsert?.set };
    expect(
      written.plan,
      'checkout.session.completed must flip plan to "pro" (the projected tier from the ' +
        `subscription's lookup_key). Got ${JSON.stringify(written.plan)}.`,
    ).toBe('pro');
    expect(
      written.subscriptionId,
      'The UPSERT must persist the Subscription id so update/delete can key on it later. ' +
        `Got ${JSON.stringify(written.subscriptionId)}.`,
    ).toBe('sub_test');
    expect(
      written.currentPeriodEnd,
      'currentPeriodEnd must be set from the subscription item (a Date), so the success ' +
        'page and gate can read the billing period.',
    ).toBeInstanceOf(Date);
  });

  it('stamps lastEventAt from event.created as a Date (ms = created * 1000)', async () => {
    const tx = makeTx();
    await onCheckoutCompleted(tx.handle as never, checkoutEvent());

    const upsert = tx.writes.find((w): w is Upsert => w.op === 'upsert');
    const written = { ...upsert?.values, ...upsert?.set } as {
      lastEventAt?: unknown;
    };
    expect(
      written.lastEventAt,
      'lastEventAt is the ordering high-water mark — it must be a Date built from the ' +
        "event's `created` (Unix SECONDS): `new Date(event.created * 1000)`, never the raw " +
        'integer. A raw number breaks the < comparison the column relies on.',
    ).toBeInstanceOf(Date);
    expect(
      (written.lastEventAt as Date).getTime(),
      'lastEventAt must equal event.created * 1000 (Stripe sends seconds, the column takes ' +
        'milliseconds).',
    ).toBe(CHECKOUT_CREATED_UNIX * 1000);
  });
});

// FR3 — the checkout transition writes exactly one billing.subscription.activated audit
// row, co-transacted with the entitlement write.
describe('FR3: checkout co-writes one activation audit row', () => {
  it('writes exactly one billing.subscription.activated audit row', async () => {
    const tx = makeTx();
    await onCheckoutCompleted(tx.handle as never, checkoutEvent());

    const activations = auditCalls.filter(
      (c) => c.action === 'billing.subscription.activated',
    );
    expect(
      activations.length,
      'A checkout transition must co-write exactly one audit row with action ' +
        `'billing.subscription.activated'. Got ${activations.length} such row(s) ` +
        `(all audit actions: ${JSON.stringify(auditCalls.map((c) => c.action))}).`,
    ).toBe(1);
  });
});

// FR4 — customer.subscription.updated refreshes status / currentPeriodEnd /
// cancelAtPeriodEnd on the existing row (UPDATE, no re-fetch) and writes a
// billing.subscription.updated audit row.
describe('FR4: subscription.updated refreshes the row and audits an update', () => {
  it('UPDATEs status, currentPeriodEnd and cancelAtPeriodEnd from the payload', async () => {
    const tx = makeTx();
    await onSubscriptionUpdated(
      tx.handle as never,
      subscriptionEvent('customer.subscription.updated', {
        status: 'past_due',
        cancel_at_period_end: true,
      }),
    );

    const update = tx.writes.find((w): w is Update => w.op === 'update');
    expect(
      update,
      'onSubscriptionUpdated must UPDATE the existing row (not UPSERT) — the row is ' +
        'guaranteed by now. No update was performed.',
    ).toBeDefined();

    expect(
      update?.set.status,
      'The UPDATE must refresh status from the event payload (the payload IS the full ' +
        `Subscription — do NOT re-fetch it). Expected 'past_due', got ${JSON.stringify(update?.set.status)}.`,
    ).toBe('past_due');
    expect(
      update?.set.cancelAtPeriodEnd,
      'The UPDATE must refresh cancelAtPeriodEnd from the payload (so the wind-down ' +
        `banner is accurate). Expected true, got ${JSON.stringify(update?.set.cancelAtPeriodEnd)}.`,
    ).toBe(true);
    expect(
      update?.set.currentPeriodEnd,
      'The UPDATE must refresh currentPeriodEnd from the subscription item as a Date.',
    ).toBeInstanceOf(Date);
  });

  it('writes a billing.subscription.updated audit row on the live update', async () => {
    const tx = makeTx();
    await onSubscriptionUpdated(
      tx.handle as never,
      subscriptionEvent('customer.subscription.updated'),
    );
    expect(
      auditCalls.map((c) => c.action),
      "A live update must co-write a 'billing.subscription.updated' audit row.",
    ).toContain('billing.subscription.updated');
  });
});

// FR5 — customer.subscription.deleted reverts plan to 'free', status to 'canceled',
// subscriptionId to null, and writes a billing.subscription.canceled audit row.
describe('FR5: subscription.deleted reverts to free and audits a cancellation', () => {
  it('UPDATEs plan="free", status="canceled", subscriptionId=null', async () => {
    const tx = makeTx();
    await onSubscriptionDeleted(
      tx.handle as never,
      subscriptionEvent('customer.subscription.deleted'),
    );

    const update = tx.writes.find((w): w is Update => w.op === 'update');
    expect(
      update,
      'onSubscriptionDeleted must UPDATE the row. No update ran.',
    ).toBeDefined();
    expect(
      update?.set.plan,
      `A deleted subscription must wind the row back to plan "free". Got ${JSON.stringify(update?.set.plan)}.`,
    ).toBe('free');
    expect(
      update?.set.status,
      `A deleted subscription must set status "canceled". Got ${JSON.stringify(update?.set.status)}.`,
    ).toBe('canceled');
    expect(
      update?.set.subscriptionId,
      'A deleted subscription must null the subscriptionId (the pointer is gone). Got ' +
        `${JSON.stringify(update?.set.subscriptionId)}.`,
    ).toBeNull();
  });

  it('writes a billing.subscription.canceled audit row on the live delete', async () => {
    const tx = makeTx();
    await onSubscriptionDeleted(
      tx.handle as never,
      subscriptionEvent('customer.subscription.deleted'),
    );
    expect(
      auditCalls.map((c) => c.action),
      "A live cancellation must co-write a 'billing.subscription.canceled' audit row.",
    ).toContain('billing.subscription.canceled');
  });
});

// FR6 — an out-of-order event (created earlier than the row's lastEventAt) must not
// regress the row and must write no audit row. In Postgres the ordering predicate lives
// in the UPDATE's WHERE, so a stale event matches ZERO rows; the handler reads the empty
// `.returning()` result and no-ops. We simulate the zero-row match and assert the audit
// row is suppressed — the honest no-op. (Paired with FR4/FR5, which prove the live path
// DOES audit, so the gate is the row-count, not an unconditional skip.)
describe('FR6: a stale (out-of-order) event is a silent no-op', () => {
  it('writes no audit row when the ordering predicate matched zero rows (updated)', async () => {
    updateResult = []; // the WHERE (lastEventAt < eventAt) matched nothing
    const tx = makeTx();
    await onSubscriptionUpdated(
      tx.handle as never,
      subscriptionEvent('customer.subscription.updated'),
    );
    expect(
      auditCalls.length,
      'A stale update matches zero rows (the lastEventAt < eventAt predicate fails under ' +
        'the row lock). The handler must read the empty `.returning()` result and return ' +
        'WITHOUT writing an audit row. An audit row was written for a no-op transition.',
    ).toBe(0);
  });

  it('writes no audit row when the ordering predicate matched zero rows (deleted)', async () => {
    updateResult = [];
    const tx = makeTx();
    await onSubscriptionDeleted(
      tx.handle as never,
      subscriptionEvent('customer.subscription.deleted'),
    );
    expect(
      auditCalls.length,
      'A stale delete matches zero rows. The handler must detect the empty ' +
        '`.returning()` result and return without auditing.',
    ).toBe(0);
  });
});

// FR7 — subscriptionToEntitlement is the pure projection seam; it throws on an unknown
// lookup_key or a subscription with no items, so the handler 500s and Stripe retries
// rather than silently provisioning the wrong tier.
describe('FR7: the projection throws on an unknown plan or empty subscription', () => {
  const catalog = loadCatalogFor();

  it('throws on a lookup_key the catalog does not know', () => {
    const sub = makeSubscription({
      items: {
        data: [
          {
            price: { lookup_key: 'course_unknown_yearly' },
            current_period_end: FIXTURE_PERIOD_UNIX,
            quantity: 1,
          },
        ],
      },
    });
    expect(
      () => subscriptionToEntitlement(sub as never, catalog),
      'An unrecognized lookup_key must be a HARD failure (throw), so the webhook 500s and ' +
        'Stripe retries — never silently provision a default tier from a Stripe-side seed drift.',
    ).toThrow();
  });

  it('throws on a subscription with no items', () => {
    const sub = makeSubscription({ items: { data: [] } });
    expect(
      () => subscriptionToEntitlement(sub as never, catalog),
      'A subscription with no items has no plan to project — it must throw, not read ' +
        'items.data[0] off undefined and crash unhelpfully later.',
    ).toThrow();
  });

  it('projects a known lookup_key to its plan slug', () => {
    const patch = subscriptionToEntitlement(
      makeSubscription() as never,
      catalog,
    );
    expect(
      patch.plan,
      "A known lookup_key must project to its catalog slug ('pro' for course_pro_monthly).",
    ).toBe('pro');
  });
});

// A real catalog instance for the pure-projection tests (the vi.mock above only swaps
// the module the HANDLERS reach; the projection takes its catalog as an argument).
function loadCatalogFor() {
  return {
    planFromLookupKey: (key: string | null | undefined) =>
      key === 'course_pro_monthly' ? ('pro' as const) : null,
    lookupKeys: { course_pro_monthly: 'pro' as const },
  };
}

// FR8 — getEntitlement returns the org's row (deduped per request) and throws when the
// row is missing; hasActiveAccess returns the decision-table answer for every status.
describe('FR8: the entitlement read + access decision table', () => {
  it('getEntitlement returns the org row when present', async () => {
    entitlementRow = {
      organizationId: 'org_test',
      plan: 'pro',
      status: 'active',
    };
    const row = await getEntitlement('org_test');
    expect(
      row,
      "getEntitlement must return the org's plan_entitlements row read from the database.",
    ).toMatchObject({ organizationId: 'org_test', plan: 'pro' });
  });

  it('getEntitlement throws when the row is missing (provisioning invariant)', async () => {
    entitlementRow = undefined;
    await expect(
      getEntitlement('org_missing'),
      'A missing plan_entitlements row is the provisioning invariant violated (every org ' +
        'gets a free row at creation). getEntitlement must THROW, never return null the ' +
        'gate would mis-read as no-access.',
    ).rejects.toThrow();
  });

  it('hasActiveAccess grants access for trialing | active | past_due', () => {
    for (const status of ['trialing', 'active', 'past_due'] as const) {
      expect(
        hasActiveAccess({ status } as never),
        `Status '${status}' must grant access (past_due keeps access during the dunning ` +
          'grace).',
      ).toBe(true);
    }
  });

  it('hasActiveAccess denies access for canceled | incomplete', () => {
    for (const status of ['canceled', 'incomplete'] as const) {
      expect(
        hasActiveAccess({ status } as never),
        `Status '${status}' must deny access. A canceled row always denies — the post-cancel ` +
          "grace window is carried by status:'active' + cancelAtPeriodEnd, never a canceled row.",
      ).toBe(false);
    }
  });
});
