import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

// The single env boundary: application code imports `env`, never `process.env`.
// createEnv validates at build time — a missing/invalid DATABASE_URL fails
// `next build` with a message naming the variable.
//
// Secrets management (082 finding 5, pre-fixed): the Resend key lives ONLY in the
// `server` partition as RESEND_API_KEY, read behind `import 'server-only'` in
// src/lib/email.ts. There is no NEXT_PUBLIC_RESEND_API_KEY — a secret never carries
// the NEXT_PUBLIC_ prefix, and the @t3-oss/env-nextjs split makes importing the
// server key from a client component a build-time error. The send runs through a
// Server Action, never a browser fetch.
//
// Sentry wiring (finding 1, slice S2): the DSN is the client-readable copy of the one
// DSN that covers client and server (NEXT_PUBLIC_ prefix so the browser SDK in
// instrumentation-client.ts can read it); the auth token / org / project / release are
// the build-time keys withSentryConfig and the config files consume. All are optional —
// the source-map upload is gated on SENTRY_AUTH_TOKEN, so an empty token skips upload
// rather than failing the build, and the dummy local values stay commented in .env.
// The Sentry config files read process.env directly, outside this schema, by design;
// these entries document and validate the shape at the build boundary.
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
    // Sentry build-time keys (finding 1). The auth token gates the source-map upload at
    // build (empty → upload skipped, traces stay minified — the named trap); org/project
    // address the upload; release is computed from the deploy SHA with a static dev
    // fallback so a week of errors is never tied to one hardcoded version.
    SENTRY_AUTH_TOKEN: z.string().optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    SENTRY_RELEASE: z
      .string()
      .default(process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev'),
  },
  client: {
    NEXT_PUBLIC_APP_NAME: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.url(),
    // PostHog (bonus #9). The project key is genuinely public; the consent gate, not
    // the key, is the seeded defect — see src/app/_components/providers.tsx.
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1),
    NEXT_PUBLIC_POSTHOG_HOST: z.url(),
    // The client-readable Sentry DSN (finding 1) — one DSN for client and server.
    // Optional so the dummy local value can stay commented in .env without failing the
    // build; the SDK no-ops when the DSN is absent.
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
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
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    SENTRY_RELEASE: process.env.SENTRY_RELEASE,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
});
