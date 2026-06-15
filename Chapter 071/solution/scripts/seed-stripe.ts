import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import Stripe from 'stripe';

// Seeds the student's test-mode Stripe account with the free/pro/team Products and
// their monthly Prices, then rewrites src/lib/billing/catalog.json with the real
// lookup_keys. Idempotent: find-or-create by lookup_key, so re-running is a no-op.
//
// Runs as a tsx CLI (`pnpm seed:stripe`), NOT inside Next, so it constructs its own
// Stripe client from process.env rather than importing the server-only singleton
// (whose `import 'server-only'` would throw under Node). The app's lib/billing/**
// boundary is unaffected — this lives under scripts/, outside src/.

const SECRET = process.env.STRIPE_SECRET_KEY;
if (!SECRET?.startsWith('sk_test_')) {
  throw new Error(
    'STRIPE_SECRET_KEY must be set to a test-mode key (sk_test_…) before seeding Stripe.',
  );
}

const stripe = new Stripe(SECRET, {
  apiVersion: '2026-05-27.dahlia',
  typescript: true,
});

// The plans this course offers. `free` has no Stripe Price (it is the absence of a
// subscription); pro/team each get one monthly Price keyed by lookup_key — the
// stable handle the app resolves a Price by, decoupled from the volatile price_id.
const PLANS = [
  {
    slug: 'pro',
    productName: 'Course Pro',
    lookupKey: 'course_pro_monthly',
    unitAmount: 2000,
  },
  {
    slug: 'team',
    productName: 'Course Team',
    lookupKey: 'course_team_monthly',
    unitAmount: 5000,
  },
] as const;

const findOrCreateProduct = async (name: string): Promise<Stripe.Product> => {
  const existing = await stripe.products.search({
    query: `name:'${name}' AND active:'true'`,
  });
  if (existing.data[0]) {
    return existing.data[0];
  }
  return stripe.products.create({ name });
};

const findOrCreatePrice = async (
  product: Stripe.Product,
  lookupKey: string,
  unitAmount: number,
): Promise<Stripe.Price> => {
  const existing = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  if (existing.data[0]) {
    return existing.data[0];
  }
  return stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: unitAmount,
    recurring: { interval: 'month' },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
  });
};

export const seedStripe = async (): Promise<void> => {
  const lookupKeys: Record<string, 'pro' | 'team'> = {};

  for (const plan of PLANS) {
    const product = await findOrCreateProduct(plan.productName);
    const price = await findOrCreatePrice(
      product,
      plan.lookupKey,
      plan.unitAmount,
    );
    lookupKeys[plan.lookupKey] = plan.slug;
    console.info(
      `[seed:stripe] ${plan.slug}: product ${product.id}, price ${price.id} (lookup_key ${plan.lookupKey})`,
    );
  }

  const catalogPath = resolve('src', 'lib', 'billing', 'catalog.json');
  await writeFile(
    catalogPath,
    `${JSON.stringify({ lookup_keys: lookupKeys }, null, 2)}\n`,
  );
  console.info(`[seed:stripe] rewrote ${catalogPath}`);
};

// pathToFileURL normalizes the entry path so the guard fires even when the project
// path contains a space (import.meta.url percent-encodes it while process.argv[1]
// keeps it literal — a naive compare would silently skip).
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  seedStripe()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
