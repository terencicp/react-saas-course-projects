// MUST be first: loads .env.test and pins TZ before any @/… module body reads
// process.env (its import is side-effect-only and pulls nothing from @/).
import '@/test/load-test-env';

import { afterAll, afterEach, beforeAll, vi } from 'vitest';

import { resendCalls } from '@/test/msw/handlers/resend';
import { server } from '@/test/msw/server';
import { resetSubscriptions } from '@/test/stripe-retrieve-registry';

// Fail-fast production-URL guard: refuse to run the destructive integration suite
// against anything but the local test Postgres.
if (!process.env.DATABASE_URL_TEST?.includes('localhost:55432')) {
  throw new Error(
    `integration tests refuse to run: DATABASE_URL_TEST must point at localhost:55432 (got: ${process.env.DATABASE_URL_TEST ?? 'unset'})`,
  );
}

// ── The @/db mock: the single seam that makes the real route testable with ZERO SUT
// edits. The route imports { db } from '@/db' and opens db.transaction(fn). This Proxy
// resolves every member access to the testTxContext-current Transaction (the rollback
// tx the surrounding withRollback opened), and makes db.transaction(fn) run fn(tx)
// DIRECTLY on that in-scope tx — so the route's transaction becomes a no-op join and the
// OUTER withRollback owns the rollback. Outside a test (no store) it falls back to a
// lazily-opened getTestDb().
vi.mock('@/db', async (importActual) => {
  const actual = await importActual<typeof import('@/db')>();
  const { testTxContext } = await import('@/db/test-tx-context');
  const { getTestDb } = await import('@/test/db/worker-db');

  type Tx = import('@/db').Transaction;

  const proxy = new Proxy({} as typeof actual.db, {
    get(_target, prop) {
      const current = testTxContext.getStore() ?? getTestDb();
      if (prop === 'transaction') {
        return (fn: (tx: Tx) => Promise<unknown>) =>
          fn((testTxContext.getStore() ?? current) as Tx);
      }
      return Reflect.get(current as object, prop);
    },
  });

  return { ...actual, db: proxy, dbUnpooled: proxy };
});

// ── The Stripe-SDK mock: replace ONLY subscriptions.retrieve (reads the per-test
// registry). webhooks.* stay REAL (signature verification is local, no network), so
// generateTestHeaderString (in post-webhook) and constructEvent (in the route) both run
// for real. MSW cannot intercept stripe@22's NodeHttpClient — see msw/server.ts.
vi.mock('@/lib/billing/stripe', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/billing/stripe')>();
  const { lookupSubscription } = await import(
    '@/test/stripe-retrieve-registry'
  );

  return {
    ...actual,
    stripe: {
      ...actual.stripe,
      webhooks: actual.stripe.webhooks,
      subscriptions: {
        retrieve: async (id: string) => lookupSubscription(id),
      },
    },
  };
});

// onUnhandledRequest: 'error' turns any stray outbound call into a loud failure — the
// network-boundary guard.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  resendCalls.length = 0;
  resetSubscriptions();
});

afterAll(() => {
  server.close();
});
