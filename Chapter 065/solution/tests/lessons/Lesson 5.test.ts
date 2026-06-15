import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Lesson 5 — "Ship the three-method billing interface". This is the only out-bound seam
// the app uses to talk to Stripe: three methods behind `lib/billing/`. `upgrade` and
// `openPortal` are admin Server Actions that return a `Result<{ url }>`; `requirePlan` is
// a `server-only` Server-Component gate that THROWS a BillingError (caught by error.tsx)
// rather than returning a Result.
//
// Node env, no DOM. The full Upgrade → Checkout → success-page flip and the Portal-cancel
// round-trip are live Stripe-hosted journeys (manual checklist, untested here). What the
// suite owns is the seam behaviour each method controls WITHOUT a live Stripe call:
//   - upgrade: resolves the Price from the catalog lookup_key (never a hardcoded id) and
//     returns ok({ url }); returns err('not_found') when no Price exists for the plan.
//   - openPortal: returns err('forbidden') when the org has no Stripe Customer yet.
//   - requirePlan: three dispositions driven by the entitlement row — resolves on active
//     >= tier, throws BillingError('no_access') on inactive, throws BillingError
//     ('plan_required') on too-low tier.
//
// We call the REAL methods and observe their returned Result / thrown error. The IO
// collaborators on the path (auth resolution, the org/entitlement reads, the catalog, the
// Stripe SDK) are replaced with inert stand-ins so the suite needs no live Postgres and no
// network — the gate is each method's observable output, never a call count or a Stripe
// fixture. Everything is inlined: only vitest and the student's modules are imported.

// --- env boot ----------------------------------------------------------------
// The methods' import graph reaches `@/env`, which validates required vars at import time.
// The lesson runner does not load `.env`, so seed the boundary's vars BEFORE the modules
// (and their env module) are imported.
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
  STRIPE_WEBHOOK_SECRET: 'whsec_lesson5_test_secret_value_0000',
  STRIPE_PORTAL_RETURN_URL: 'http://localhost:3000/inspector',
  APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_APP_NAME: 'Acme',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
};
for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  process.env[key] ??= value;
}

// --- module isolation --------------------------------------------------------
// The modules under test (and their collaborators) begin with `import 'server-only'`,
// whose guard throws outside a real Server Component. Neutralize it for the node test env.
vi.mock('server-only', () => ({}));

// `next/headers` is reached by the authedAction factory (for ip / user-agent). A Map-like
// handle satisfies its `.get(...)` calls without a request context.
vi.mock('next/headers', () => ({
  headers: async () => new Map<string, string>(),
}));

// --- auth context ------------------------------------------------------------
// Both Server Actions run through authedAction, which calls requireOrgUser() and gates on
// role. requirePlan calls requireOrgUser() directly. The suite flips `actingRole` so the
// role gate is satisfied for the action tests; `orgId` is the tenant under test.
let actingRole: 'owner' | 'admin' | 'member' = 'admin';
vi.mock('@/lib/auth', () => ({
  requireOrgUser: async () => ({
    user: { id: 'user_test', email: 'owner@acme.example' },
    orgId: 'org_test',
    role: actingRole,
  }),
}));

// authedAction builds a tenant db handle it never exercises on these paths; an inert stub
// keeps the import graph satisfied.
vi.mock('@/db/tenant', () => ({
  tenantDb: () => ({}),
}));

// --- org read (upgrade + portal) ---------------------------------------------
// Both actions read the org to find (or lazily create) its Stripe Customer. The suite
// flips `orgCustomerId` to drive the Customer-present / Customer-absent branches.
let orgCustomerId: string | null = 'cus_existing';
const setCustomerCalls: string[] = [];
vi.mock('@/db/queries/organizations', () => ({
  getOrgWithOwnerEmail: async (orgId: string) => ({
    id: orgId,
    stripeCustomerId: orgCustomerId,
    ownerEmail: 'owner@acme.example',
  }),
  setStripeCustomerId: async (_orgId: string, customerId: string) => {
    setCustomerCalls.push(customerId);
    orgCustomerId = customerId;
  },
}));

// --- entitlement read (requirePlan) ------------------------------------------
// requirePlan reads the org's entitlement row and asks hasActiveAccess for the decision.
// The suite flips `entitlement` per disposition. hasActiveAccess here mirrors the real
// decision table (trialing | active | past_due → access) so the gate's branch is exercised
// by the SAME status semantics the app uses, without importing the student's copy.
let entitlement: { plan: 'free' | 'pro' | 'team'; status: string } = {
  plan: 'pro',
  status: 'active',
};
vi.mock('@/db/queries/entitlements', () => ({
  getEntitlement: async () => entitlement,
  hasActiveAccess: (e: { status: string }) =>
    e.status === 'trialing' || e.status === 'active' || e.status === 'past_due',
}));

// --- catalog (upgrade) -------------------------------------------------------
// The catalog maps lookup_key → plan slug; `upgrade` reverse-scans it to resolve the
// Price's lookup_key for the requested plan. The suite flips `catalogKeys` so the
// no-configured-Price branch (a plan with no lookup_key) is reachable.
let catalogKeys: Record<string, 'free' | 'pro' | 'team'> = {
  course_pro_monthly: 'pro',
  course_team_monthly: 'team',
};
vi.mock('@/lib/billing/catalog', () => ({
  loadCatalog: () => ({
    lookupKeys: catalogKeys,
    planFromLookupKey: (key: string | null | undefined) =>
      key ? (catalogKeys[key] ?? null) : null,
  }),
}));

// --- Stripe SDK --------------------------------------------------------------
// The single SDK boundary. We record the args each method passes and return shape-correct
// fixtures so the assertion stays on the method's Result, never on Stripe. `priceList`
// holds the Prices a lookup_keys query returns ([] simulates a Stripe account with no
// Price for that lookup_key, even though the catalog knows the slug).
type CreateArgs = Record<string, unknown>;
let priceList: Array<{ id: string }> = [{ id: 'price_test_pro' }];
let checkoutUrl: string | null =
  'https://checkout.stripe.com/c/pay/cs_test_123';
const checkoutArgs: CreateArgs[] = [];
const customerCreateArgs: CreateArgs[] = [];
const portalArgs: CreateArgs[] = [];
const priceListArgs: CreateArgs[] = [];

vi.mock('@/lib/billing/stripe', () => ({
  stripe: {
    customers: {
      create: async (args: CreateArgs) => {
        customerCreateArgs.push(args);
        return { id: 'cus_created' };
      },
    },
    prices: {
      list: async (args: CreateArgs) => {
        priceListArgs.push(args);
        return { data: priceList };
      },
    },
    checkout: {
      sessions: {
        create: async (args: CreateArgs) => {
          checkoutArgs.push(args);
          return { url: checkoutUrl };
        },
      },
    },
    billingPortal: {
      sessions: {
        create: async (args: CreateArgs) => {
          portalArgs.push(args);
          return { url: 'https://billing.stripe.com/p/session/test_456' };
        },
      },
    },
  },
}));

// --- modules under test (imported after env + mocks) -------------------------
let upgrade: typeof import('@/lib/billing/upgrade').upgrade;
let openPortal: typeof import('@/lib/billing/portal').openPortal;
let requirePlan: typeof import('@/lib/billing/require-plan').requirePlan;

beforeAll(async () => {
  ({ upgrade } = await import('@/lib/billing/upgrade'));
  ({ openPortal } = await import('@/lib/billing/portal'));
  ({ requirePlan } = await import('@/lib/billing/require-plan'));
});

beforeEach(() => {
  actingRole = 'admin';
  orgCustomerId = 'cus_existing';
  setCustomerCalls.length = 0;
  entitlement = { plan: 'pro', status: 'active' };
  catalogKeys = { course_pro_monthly: 'pro', course_team_monthly: 'team' };
  priceList = [{ id: 'price_test_pro' }];
  checkoutUrl = 'https://checkout.stripe.com/c/pay/cs_test_123';
  checkoutArgs.length = 0;
  customerCreateArgs.length = 0;
  portalArgs.length = 0;
  priceListArgs.length = 0;
});

// Server Actions take (_prev, formData). Inline the FormData build so the suite drives the
// real action contract.
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    fd.set(k, v);
  }
  return fd;
};

// FR3 — `upgrade` returns ok({ url }) for a valid plan and resolves the Price from the
// catalog lookup_key (via stripe.prices.list), never a hardcoded price id.
describe('FR3: upgrade resolves a Price from the catalog lookup_key and returns a Checkout url', () => {
  it('returns Result.ok carrying the Checkout url for a valid plan', async () => {
    const result = await upgrade(null, form({ planSlug: 'pro' }));
    expect(
      result.ok,
      'upgrade must succeed for a configured plan and return Result.ok. Got ' +
        `${JSON.stringify(result)}. Check the action creates a Checkout session and ` +
        'returns ok({ url }).',
    ).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(
      result.data.url,
      'upgrade must carry the Stripe-hosted Checkout url back to the client island (it ' +
        'navigates the browser there). The ok payload had no url string.',
    ).toBe('https://checkout.stripe.com/c/pay/cs_test_123');
  });

  it('resolves the Price via stripe.prices.list keyed by the catalog lookup_key', async () => {
    await upgrade(null, form({ planSlug: 'pro' }));
    const listed = priceListArgs.at(-1)?.lookup_keys;
    expect(
      listed,
      'The Price must be resolved by listing Prices by lookup_key (stripe.prices.list({ ' +
        'lookup_keys: [...] })), never a hardcoded price_id. No lookup_keys query was made.',
    ).toEqual(['course_pro_monthly']);
  });

  it('passes the resolved Price id (from stripe.prices.list) into the Checkout line item', async () => {
    priceList = [{ id: 'price_resolved_xyz' }];
    await upgrade(null, form({ planSlug: 'pro' }));
    const lineItems = checkoutArgs.at(-1)?.line_items as
      | Array<{ price?: string }>
      | undefined;
    expect(
      lineItems?.[0]?.price,
      'The Checkout session must use the Price id returned by stripe.prices.list, not a ' +
        'literal from the source — proving the lookup_key indirection is real. Got ' +
        `${JSON.stringify(lineItems)}.`,
    ).toBe('price_resolved_xyz');
  });
});

// FR4 — `upgrade` for a plan with no configured Price returns err('not_found').
describe('FR4: upgrade returns not_found when no Price is configured for the plan', () => {
  it("returns err('not_found') when the catalog has no lookup_key for the plan", async () => {
    catalogKeys = { course_pro_monthly: 'pro' }; // 'team' has no lookup_key
    const result = await upgrade(null, form({ planSlug: 'team' }));
    expect(
      result.ok === false && result.error.code,
      'A plan with no catalog lookup_key has no Price to sell — upgrade must return ' +
        `err('not_found'), not crash and not silently succeed. Got ${JSON.stringify(result)}.`,
    ).toBe('not_found');
  });

  it("returns err('not_found') when Stripe has no active Price for the lookup_key", async () => {
    priceList = []; // catalog knows the slug, but the Stripe account has no Price
    const result = await upgrade(null, form({ planSlug: 'pro' }));
    expect(
      result.ok === false && result.error.code,
      'When stripe.prices.list returns no Price for the lookup_key, upgrade must return ' +
        `err('not_found') — never reach checkout.sessions.create with an undefined price. ` +
        `Got ${JSON.stringify(result)}.`,
    ).toBe('not_found');
  });
});

// FR6 — `openPortal` with no Stripe Customer yet returns err('forbidden') (sourced from a
// BillingError('no_customer')). The button-disabled UI half is manual.
describe('FR6: openPortal refuses with forbidden when the org has no Stripe Customer', () => {
  it("returns err('forbidden') when stripeCustomerId is null", async () => {
    orgCustomerId = null;
    const result = await openPortal(null, form({}));
    expect(
      result.ok === false && result.error.code,
      'openPortal must guard the no-Customer case: with no stripeCustomerId there is no ' +
        `Portal to open, so return err('forbidden') (from a BillingError('no_customer')) ` +
        `rather than calling Stripe. Got ${JSON.stringify(result)}.`,
    ).toBe('forbidden');
  });

  it('opens a Portal session and returns ok({ url }) once a Customer exists', async () => {
    orgCustomerId = 'cus_existing';
    const result = await openPortal(null, form({}));
    expect(
      result.ok,
      'With a Stripe Customer on the org, openPortal must create a Billing Portal session ' +
        `and return ok({ url }). Got ${JSON.stringify(result)}.`,
    ).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(
      result.data.url,
      'openPortal must return the Portal session url so the island can window.open it.',
    ).toBe('https://billing.stripe.com/p/session/test_456');
  });
});

// FR7 — requirePlan reads the entitlement row and resolves or throws on three dispositions.
describe('FR7: requirePlan gates on the entitlement row (active / inactive / too-low tier)', () => {
  it('resolves (no throw) when the entitlement is active and rank >= the required tier', async () => {
    entitlement = { plan: 'pro', status: 'active' };
    await expect(
      requirePlan('pro'),
      'An active entitlement at or above the required tier must PASS the gate (no throw), ' +
        'so the protected page renders its content. requirePlan threw for a satisfied plan.',
    ).resolves.toBeUndefined();
  });

  it("throws BillingError('no_access') when the entitlement is inactive", async () => {
    entitlement = { plan: 'pro', status: 'canceled' };
    let code: unknown;
    try {
      await requirePlan('pro');
    } catch (e) {
      code = (e as { code?: unknown }).code;
    }
    expect(
      code,
      "An inactive entitlement (e.g. status 'canceled') must throw BillingError with code " +
        "'no_access' — distinct from the too-low-tier case so error.tsx can render the " +
        `reactivate message. Got code ${JSON.stringify(code)} (or no throw).`,
    ).toBe('no_access');
  });

  it("throws BillingError('plan_required') when the tier is too low", async () => {
    entitlement = { plan: 'free', status: 'active' }; // active, but free < pro
    let code: unknown;
    try {
      await requirePlan('pro');
    } catch (e) {
      code = (e as { code?: unknown }).code;
    }
    expect(
      code,
      'An active entitlement on a lower tier than required (free < pro, via PLAN_RANK) must ' +
        "throw BillingError with code 'plan_required' — the upgrade fallback, not the " +
        `reactivate one. Got code ${JSON.stringify(code)} (or no throw).`,
    ).toBe('plan_required');
  });

  it('a higher tier admits a lower-tier gate (team passes requirePlan("pro"))', async () => {
    entitlement = { plan: 'team', status: 'active' };
    await expect(
      requirePlan('pro'),
      'The gate must compare RANKS, not equality — a team entitlement satisfies a pro gate. ' +
        'requirePlan("pro") threw for a team plan.',
    ).resolves.toBeUndefined();
  });
});
