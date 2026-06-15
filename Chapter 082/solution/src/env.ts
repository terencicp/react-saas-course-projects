import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

// The single env boundary: application code imports `env`, never `process.env`.
// createEnv validates at build time — a missing/invalid DATABASE_URL fails
// `next build` with a message naming the variable.
//
// SEEDED AUDIT DEFECT #5 (finding 5): RESEND_API_KEY is declared in the `client`
// partition as NEXT_PUBLIC_RESEND_API_KEY. A NEXT_PUBLIC_* var is inlined into the
// browser bundle, so the Resend secret ships to every visitor. The healthy shape is
// `RESEND_API_KEY` in the `server` block + a Server Action — see
// findings/005-secret-next-public.md. The target ships the bug on purpose; do not
// "fix" it here.
export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    DATABASE_URL_UNPOOLED: z.url(),
    SEED: z.coerce.number().default(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    // The legitimate server-side Resend key the email send path uses (lib/email.ts).
    // The healthy shape: this is the ONLY place the Resend key lives. Seeded defect
    // #5 adds a second, client-exposed copy (NEXT_PUBLIC_RESEND_API_KEY below).
    RESEND_API_KEY: z.string().min(1),
    EMAIL_FROM: z.string().min(1),
    EMAIL_REPLY_TO: z.email(),
    INVITATION_SIGNING_SECRET: z.string().min(1),
    // Upstash Redis (REST) — read once by Redis.fromEnv() in src/lib/redis.ts.
    UPSTASH_REDIS_REST_URL: z.url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
    // Stripe (065 carry). Test-mode keys validated at boot.
    STRIPE_SECRET_KEY: z.string().startsWith('sk_test_'),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
    STRIPE_PORTAL_RETURN_URL: z.url(),
    // Trigger.dev v4. Dummy `tr_dev_…`/`proj_…` values pass validation with no
    // round-trip — no worker, no cloud project at build/render time.
    TRIGGER_SECRET_KEY: z.string().startsWith('tr_'),
    TRIGGER_PROJECT_REF: z.string().startsWith('proj_'),
    // The app's public origin, used to build the export download link base.
    APP_URL: z.url(),
  },
  client: {
    NEXT_PUBLIC_APP_NAME: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.url(),
    // PostHog (bonus #9). The project key is genuinely public; the consent gate, not
    // the key, is the seeded defect — see src/app/_components/providers.tsx.
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1),
    NEXT_PUBLIC_POSTHOG_HOST: z.url(),
    // SEEDED AUDIT DEFECT #5: a secret in the client partition. See the comment above.
    NEXT_PUBLIC_RESEND_API_KEY: z.string().min(1),
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
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PORTAL_RETURN_URL: process.env.STRIPE_PORTAL_RETURN_URL,
    TRIGGER_SECRET_KEY: process.env.TRIGGER_SECRET_KEY,
    TRIGGER_PROJECT_REF: process.env.TRIGGER_PROJECT_REF,
    APP_URL: process.env.APP_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_RESEND_API_KEY: process.env.NEXT_PUBLIC_RESEND_API_KEY,
  },
});
