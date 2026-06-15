import 'server-only';

import { z } from 'zod';

import catalogJson from '@/lib/billing/catalog.json';

// The three plan tiers, ordered free < pro < team. The webhook projection maps a
// Stripe Price's lookup_key to one of these; `upgrade` resolves a Price back from
// the lookup_key. This is the single source of truth for the slug vocabulary.
export type PlanSlug = 'free' | 'pro' | 'team';

// The catalog file shape: a lookup_key → plan-slug map. `seed:stripe` rewrites this
// file with the real lookup_keys from the student's test-mode account, so the values
// here are the seed defaults, parsed (not trusted) at load.
const catalogSchema = z.object({
  lookup_keys: z.record(z.string(), z.enum(['free', 'pro', 'team'])),
});

export type Catalog = {
  // Resolve a Stripe Price lookup_key to a plan slug; unknown / missing → null
  // (the caller decides whether that is a hard failure — the projection throws
  // BillingError('unknown_plan')).
  planFromLookupKey: (key: string | null | undefined) => PlanSlug | null;
  // The raw lookup_key → slug map (the `upgrade` action lists Prices by these keys).
  lookupKeys: Record<string, PlanSlug>;
};

// Parse the JSON once and expose the typed lookup. z.parse (not safeParse): a
// malformed catalog is a deploy-time misconfiguration that should fail loud, not a
// runtime branch.
export const loadCatalog = (): Catalog => {
  const parsed = catalogSchema.parse(catalogJson);
  const lookupKeys = parsed.lookup_keys;

  return {
    lookupKeys,
    planFromLookupKey: (key) => {
      if (!key) {
        return null;
      }
      return lookupKeys[key] ?? null;
    },
  };
};
