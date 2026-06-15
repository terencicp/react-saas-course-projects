import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Lesson 6 — "Harden the webhook against forged tenancy". The Subscription's
// `metadata.organization_id` is a carry-channel any malicious-or-buggy `upgrade` could
// set, so it cannot decide which org gets the entitlement. The authority is the org that
// owns the Stripe Customer (resolveOrgIdFromCustomer) — the app created the Customer and
// owns the mapping, which the event payload cannot forge. This lesson adds the explicit
// cross-check: when metadata.organization_id is PRESENT and DISAGREES with the
// Customer-resolved org, onCheckoutCompleted throws inside the transaction so the whole
// thing rolls back — no entitlement write onto the wrong tenant, no audit row, a 500 the
// `stripe listen` terminal surfaces. Absent or agreeing metadata still lands Pro as before.
//
// Node env, no DOM. We call the REAL onCheckoutCompleted against a recording `tx` and
// observe the side effects it leaves (the row it UPSERTs, the audit action) plus what it
// throws. The collaborators (the Stripe SDK retrieve, the catalog file, the org lookup,
// the audit writer) are inert stand-ins so the suite needs no live Postgres and no
// network — the gate is the observable write/throw, never a call count or a function name.
//
// Everything is inlined — only vitest and the student's modules are imported.

// --- env boot ----------------------------------------------------------------
// The handler's import graph reaches `@/env`, which validates required vars at import
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
  STRIPE_WEBHOOK_SECRET: 'whsec_lesson6_test_secret_value_0000',
  STRIPE_PORTAL_RETURN_URL: 'http://localhost:3000/inspector',
  APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_APP_NAME: 'Acme',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
};
for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  process.env[key] ??= value;
}

// --- module isolation --------------------------------------------------------
// The module under test begins with `import 'server-only'`, whose guard throws outside a
// real Server Component. Neutralize it for the node test env.
vi.mock('server-only', () => ({}));

// --- the authoritative org ---------------------------------------------------
// resolveOrgIdFromCustomer reverse-looks-up the org that owns a Stripe Customer. The
// suite flips `ownerOrgRow` per case: a row = a Customer the app created (its org id is
// the authority); `undefined` = a Customer the app never created (resolution must throw).
const AUTHORITATIVE_ORG_ID = 'org_owner';
let ownerOrgRow: { id: string } | undefined = { id: AUTHORITATIVE_ORG_ID };

// --- recording transaction ---------------------------------------------------
// A `tx` handle that records what the handler writes. Each terminal op pushes a record
// onto `writes`; the org reverse-lookup reads `ownerOrgRow`. If the handler throws (the
// forged-metadata rejection), no record is ever pushed — the rolled-back no-write.
type Upsert = {
  op: 'upsert';
  values: Record<string, unknown>;
  set: Record<string, unknown>;
};

const makeTx = () => {
  const writes: Upsert[] = [];
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
      query: {
        organization: {
          findFirst: async () => ownerOrgRow,
        },
      },
    },
  };
};

// --- @/db mock ---------------------------------------------------------------
// The handler's import graph reaches the global `db` singleton (the real one would open
// a Postgres pool at import time). The handler routes every write through `tx`, so a bare
// stand-in is enough to keep the import graph from touching a live connection.
vi.mock('@/db', () => ({ db: { query: {} } }));

// The audit writer — the per-transition fingerprint. Capturing the action lets us read
// whether the handler reached its audit write (legitimate land) or never did (forged
// rejection threw first).
const auditCalls: { action: string }[] = [];
vi.mock('@/db/audit-log', () => ({
  logAudit: async (_tx: unknown, event: { action: string }) => {
    auditCalls.push({ action: event.action });
  },
}));

// The catalog maps the fixture lookup_key onto a plan. `course_pro_monthly` → 'pro'.
vi.mock('@/lib/billing/catalog', () => ({
  loadCatalog: () => ({
    planFromLookupKey: (key: string | null | undefined) =>
      key === 'course_pro_monthly' ? 'pro' : null,
    lookupKeys: { course_pro_monthly: 'pro' },
  }),
}));

// The single allowed reach inside onCheckoutCompleted: stripe.subscriptions.retrieve.
// Returns the expanded Subscription the Session only carries the id of. The suite flips
// `subscriptionMetadata` per case to model the carry-channel: a forged org id, an
// agreeing org id, or absent.
const FIXTURE_PERIOD_UNIX = 1_800_000_000; // 2027-01-15T08:00:00Z
let subscriptionMetadata: Record<string, string> = {};
const makeSubscription = () => ({
  id: 'sub_test',
  status: 'active',
  cancel_at_period_end: false,
  metadata: subscriptionMetadata,
  items: {
    data: [
      {
        price: { lookup_key: 'course_pro_monthly' },
        current_period_end: FIXTURE_PERIOD_UNIX,
        quantity: 1,
      },
    ],
  },
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
const checkoutEvent = () =>
  ({
    id: 'evt_l6_checkout',
    object: 'event',
    type: 'checkout.session.completed',
    created: CHECKOUT_CREATED_UNIX,
    data: {
      object: { id: 'cs_test', customer: 'cus_test', subscription: 'sub_test' },
    },
  }) as never;

// --- modules under test (imported after env + mocks) -------------------------
let onCheckoutCompleted: typeof import('@/lib/webhooks/stripe').onCheckoutCompleted;

beforeAll(async () => {
  ({ onCheckoutCompleted } = await import('@/lib/webhooks/stripe'));
});

beforeEach(() => {
  auditCalls.length = 0;
  ownerOrgRow = { id: AUTHORITATIVE_ORG_ID };
  subscriptionMetadata = {};
});

// FR1 — a Checkout whose metadata.organization_id names a DIFFERENT org than the
// Customer's owner is rejected: nothing is written to plan_entitlements and no audit row
// is produced. The throw inside the tx callback is the rollback mechanism; we observe its
// proof as the absence of any recorded write.
describe('FR1: a forged-metadata Checkout writes nothing — no entitlement row, no audit row', () => {
  it('records no entitlement UPSERT when metadata names an org other than the Customer owner', async () => {
    subscriptionMetadata = { organization_id: 'org_attacker' };
    const tx = makeTx();
    await expect(
      onCheckoutCompleted(tx.handle as never, checkoutEvent()),
    ).rejects.toThrow();

    expect(
      tx.writes.length,
      'A Checkout whose metadata.organization_id disagrees with the org that owns the ' +
        'Customer is a forged-tenancy attempt. The cross-check must throw BEFORE the UPSERT ' +
        'so the open transaction rolls back and nothing lands on the wrong org. An ' +
        'entitlement write was recorded — the guard either runs after the write or is absent.',
    ).toBe(0);
  });

  it('writes no audit row when metadata names a different org', async () => {
    subscriptionMetadata = { organization_id: 'org_attacker' };
    const tx = makeTx();
    await expect(
      onCheckoutCompleted(tx.handle as never, checkoutEvent()),
    ).rejects.toThrow();

    expect(
      auditCalls.length,
      'A rejected forged Checkout must produce NO audit row — the throw precedes logAudit, ' +
        'so the transaction discards both the entitlement write and the audit write together. ' +
        'An audit row was written for an event that should have rolled back.',
    ).toBe(0);
  });
});

// FR2 — the rejection surfaces as a thrown BillingError('unknown_customer') (the route
// turns it into a 500; Stripe sees the failure and retries). Reusing the existing code is
// deliberate: "no org owns this Customer" and "metadata names the wrong org" are the same
// caller-visible class — a Customer→org resolution failure.
describe('FR2: a mismatch throws BillingError(unknown_customer)', () => {
  it('throws an error whose code is "unknown_customer" on a present, mismatched org id', async () => {
    subscriptionMetadata = { organization_id: 'org_attacker' };
    const tx = makeTx();

    let thrown: unknown;
    try {
      await onCheckoutCompleted(tx.handle as never, checkoutEvent());
    } catch (error) {
      thrown = error;
    }

    expect(
      thrown,
      'A present-but-mismatched metadata.organization_id must be a HARD failure — the ' +
        'handler must throw (not silently prefer the Customer-resolved org). Nothing was thrown.',
    ).toBeDefined();
    expect(
      (thrown as { code?: string }).code,
      'The mismatch must reuse BillingError("unknown_customer") — the same caller-visible ' +
        'class the route 500s on — not a new error code. ' +
        `Got code ${JSON.stringify((thrown as { code?: string }).code)}.`,
    ).toBe('unknown_customer');
  });
});

// FR4 — a legitimate Checkout (metadata equals the Customer-resolved org, OR metadata is
// absent) still flips the entitlement to Pro and writes its activation audit row exactly
// as in lesson 4. The `claimedOrgId &&` guard is what keeps the absent case passing —
// absent metadata is legitimate because the Customer reverse-lookup is the safety net.
describe('FR4: a legitimate Checkout still lands Pro and audits the activation', () => {
  it('UPSERTs plan "pro" when metadata.organization_id equals the Customer-resolved org', async () => {
    subscriptionMetadata = { organization_id: AUTHORITATIVE_ORG_ID };
    const tx = makeTx();
    await onCheckoutCompleted(tx.handle as never, checkoutEvent());

    const upsert = tx.writes.find((w) => w.op === 'upsert');
    expect(
      upsert,
      'When metadata.organization_id AGREES with the Customer-owned org the cross-check ' +
        'must pass and the entitlement UPSERT must run. No write was recorded — the guard ' +
        'is rejecting an agreeing pair (it must reject only PRESENT-and-MISMATCHED metadata).',
    ).toBeDefined();
    const written = { ...upsert?.values, ...upsert?.set };
    expect(
      written.plan,
      'An agreeing legitimate Checkout must flip the org to plan "pro" just as before the ' +
        `hardening. Got ${JSON.stringify(written.plan)}.`,
    ).toBe('pro');
    expect(
      written.organizationId,
      'The entitlement must be written onto the Customer-resolved (authoritative) org id, ' +
        `not the metadata-claimed one. Got ${JSON.stringify(written.organizationId)}.`,
    ).toBe(AUTHORITATIVE_ORG_ID);
  });

  it('UPSERTs plan "pro" when metadata carries no organization_id (absent is legitimate)', async () => {
    subscriptionMetadata = {}; // no organization_id at all
    const tx = makeTx();
    await onCheckoutCompleted(tx.handle as never, checkoutEvent());

    const upsert = tx.writes.find((w) => w.op === 'upsert');
    expect(
      upsert,
      'Absent metadata.organization_id is LEGITIMATE — the Customer reverse-lookup is the ' +
        'safety net. The guard must reject only a PRESENT-and-mismatched value (`claimedOrgId ' +
        '&& claimedOrgId !== orgId`), so an absent value must still land the entitlement. ' +
        'No write was recorded — the guard is rejecting absent metadata too.',
    ).toBeDefined();
    expect(
      { ...upsert?.values, ...upsert?.set }.plan,
      'Absent-metadata Checkout must still flip the org to "pro" via the Customer-resolved org.',
    ).toBe('pro');
  });

  it('co-writes exactly one billing.subscription.activated audit row on a legitimate land', async () => {
    subscriptionMetadata = { organization_id: AUTHORITATIVE_ORG_ID };
    const tx = makeTx();
    await onCheckoutCompleted(tx.handle as never, checkoutEvent());

    const activations = auditCalls.filter(
      (c) => c.action === 'billing.subscription.activated',
    );
    expect(
      activations.length,
      'A legitimate Checkout must co-write exactly one billing.subscription.activated audit ' +
        `row, unchanged by the hardening. Got ${activations.length} such row(s) ` +
        `(all audit actions: ${JSON.stringify(auditCalls.map((c) => c.action))}).`,
    ).toBe(1);
  });
});

// FR5 — an event for a Stripe Customer the app never created resolves to no org and is
// rejected by resolveOrgIdFromCustomer's existing BillingError('unknown_customer') throw,
// rather than creating or mutating any row. (This is lesson 4's safety net, re-confirmed
// here so the hardening rides on top of it without weakening it.)
describe('FR5: an event for an unknown Stripe Customer is rejected and writes nothing', () => {
  it('throws unknown_customer and records no write when no org owns the Customer', async () => {
    ownerOrgRow = undefined; // no org owns cus_test — the reverse-lookup finds nothing
    const tx = makeTx();

    let thrown: unknown;
    try {
      await onCheckoutCompleted(tx.handle as never, checkoutEvent());
    } catch (error) {
      thrown = error;
    }

    expect(
      (thrown as { code?: string })?.code,
      'A Checkout for a Stripe Customer the app never created must be rejected by ' +
        'resolveOrgIdFromCustomer with BillingError("unknown_customer") — never provision a ' +
        `row for an unmapped Customer. Got ${JSON.stringify((thrown as { code?: string })?.code)}.`,
    ).toBe('unknown_customer');
    expect(
      tx.writes.length,
      'An unknown Customer must mutate nothing — the throw rolls the transaction back before ' +
        'any UPSERT. A write was recorded.',
    ).toBe(0);
  });
});
