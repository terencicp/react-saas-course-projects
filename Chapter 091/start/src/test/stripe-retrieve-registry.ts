import type { Stripe } from '@/lib/billing/stripe';

// The per-test Subscription registry the stubbed `stripe.subscriptions.retrieve` reads
// (Stripe cannot ride MSW — see integration-setup.ts). A test registers the fixture its
// checkout event points at; the stub looks it up by id. This is the same per-test
// discipline `server.use(...)` gives on the MSW seam, just on the stubbed SDK seam.
//
// resetSubscriptions() is called in integration-setup.ts's afterEach, so a fixture
// registered in one test never leaks into the next.

const registry = new Map<string, Stripe.Subscription>();

export const registerSubscription = (sub: Stripe.Subscription): void => {
  registry.set(sub.id, sub);
};

export const lookupSubscription = (id: string): Stripe.Subscription => {
  const sub = registry.get(id);
  if (!sub) {
    throw new Error(
      `stripe-retrieve-registry: no fixture registered for subscription "${id}" — call registerSubscription(fixtureSubscription({ id: "${id}", … })) in the test's arrange step`,
    );
  }
  return sub;
};

export const resetSubscriptions = (): void => {
  registry.clear();
};
