import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

// The single env boundary: application code imports `env`, never `process.env`.
// createEnv validates at build time — a missing/invalid var fails `next build`
// with a message naming the variable. This is the load-bearing launch-checklist
// artifact: the Vercel build log fails on a missing var here, so the committed
// config never skips env validation (only CI's non-build jobs opt out).
//
// RESEND_API_KEY is validated-not-used: the checklist requires the key but this
// project sends no email. SENTRY_DSN and APP_URL are values, not packages — the
// deployment is by-hand, no Sentry/Vercel SDK runs at runtime.
export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    DATABASE_URL_UNPOOLED: z.url(),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.url(),
    RESEND_API_KEY: z.string().min(1),
    SENTRY_DSN: z.string().min(1),
    APP_URL: z.url(),
  },
  client: {
    NEXT_PUBLIC_APP_NAME: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.url(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    SENTRY_DSN: process.env.SENTRY_DSN,
    APP_URL: process.env.APP_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
