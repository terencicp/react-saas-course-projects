import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

// The single env boundary: application code imports `env`, never `process.env`.
// createEnv validates at build time — a missing/invalid DATABASE_URL fails
// `next build` with a message naming the variable.
//
// The Stripe block validates test-mode at boot: STRIPE_SECRET_KEY must start with
// `sk_test_` (a live key is refused before a single call goes out) and
// STRIPE_WEBHOOK_SECRET with `whsec_`. APP_URL / STRIPE_PORTAL_RETURN_URL are the
// absolute URLs Checkout and the Portal return into.
export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    DATABASE_URL_UNPOOLED: z.url(),
    SEED: z.coerce.number().default(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    RESEND_API_KEY: z.string().min(1),
    EMAIL_FROM: z.string().min(1),
    EMAIL_REPLY_TO: z.email(),
    INVITATION_SIGNING_SECRET: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().startsWith('sk_test_'),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
    STRIPE_PORTAL_RETURN_URL: z.url(),
    APP_URL: z.url(),
    // EMAIL_MOCK=1 (the default) short-circuits sendEmail before Resend so the
    // notification inspector's email-sent counter is deterministic with no live
    // round-trip. Set to '0' to send through Resend for real.
    EMAIL_MOCK: z.enum(['0', '1']).default('1'),
  },
  client: {
    NEXT_PUBLIC_APP_NAME: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.url(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    SEED: process.env.SEED,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
    INVITATION_SIGNING_SECRET: process.env.INVITATION_SIGNING_SECRET,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PORTAL_RETURN_URL: process.env.STRIPE_PORTAL_RETURN_URL,
    APP_URL: process.env.APP_URL,
    EMAIL_MOCK: process.env.EMAIL_MOCK,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
