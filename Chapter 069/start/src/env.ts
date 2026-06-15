import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

// The single env boundary: application code imports `env`, never `process.env`.
// createEnv validates at build time — a missing/invalid DATABASE_URL fails
// `next build` with a message naming the variable.
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
    // Trigger.dev v4. TRIGGER_SECRET_KEY authenticates the SDK's REST reads (the
    // `tr_dev_…`/`tr_prod_…` token from the dashboard); TRIGGER_PROJECT_REF is the
    // `proj_…` ref trigger.config.ts pins. The render pipeline supplies dummy
    // `tr_dev_…`/`proj_…` values via .env so this validation passes without a
    // Trigger.dev round-trip — no worker, no cloud project at build/render time.
    TRIGGER_SECRET_KEY: z.string().startsWith('tr_'),
    TRIGGER_PROJECT_REF: z.string().startsWith('proj_'),
    // The app's public origin, used to build the export download link base. Kept
    // server-side (the task body reads it); distinct from NEXT_PUBLIC_APP_URL.
    APP_URL: z.url(),
    // Cloudflare R2 (S3-compatible). All four are server-only — never NEXT_PUBLIC_:
    // the credentials and the bucket name must never reach the browser. The endpoint
    // is derived from R2_ACCOUNT_ID in lib/r2.ts, not a fifth env var. The render
    // pipeline supplies dummy values via .env so `next build`'s env check passes and
    // getSignedUrl (local HMAC, no R2 round-trip) can sign real-shaped URLs.
    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET_NAME: z.string().min(1),
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
    TRIGGER_SECRET_KEY: process.env.TRIGGER_SECRET_KEY,
    TRIGGER_PROJECT_REF: process.env.TRIGGER_PROJECT_REF,
    APP_URL: process.env.APP_URL,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
