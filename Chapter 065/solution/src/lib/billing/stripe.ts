import 'server-only';

import Stripe from 'stripe';

import { env } from '@/env';

// Re-export the Stripe namespace as a type so handler/projection modules can name
// `Stripe.Event` / `Stripe.Subscription` without importing the `stripe` package
// themselves — keeping lib/billing the only module that names the package, the
// single-importer boundary holding even for types.
export type { Stripe };

// The single configured Stripe SDK instance — the ONLY file that constructs it.
// Every other billing surface imports `stripe` from here; nothing else under the
// app imports the `stripe` package directly (the lib/billing-is-the-only-importer
// boundary).
//
// `apiVersion` is pinned to the SDK's own LatestApiVersion ('2026-05-27.dahlia').
// The type of this field is exactly that one string literal, so an older value
// (e.g. '2025-03-31.basil') is a hard tsc error — pin the SDK's latest, never an
// older string. The item-level current_period_end gotcha that 064 taught against
// basil holds in dahlia: the field lives on sub.items.data[0], not the Subscription
// root.
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-05-27.dahlia',
  typescript: true,
});
