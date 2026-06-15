import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

// The single env boundary: application code imports `env`, never `process.env`.
// createEnv validates at build time — a missing/invalid DATABASE_URL fails
// `next build` with a message naming the variable.
export const env = createEnv({
  // TODO(L2) — add UPSTASH_REDIS_REST_URL (z.url()) and UPSTASH_REDIS_REST_TOKEN (z.string().min(1)) to server + runtimeEnv.
  server: {
    DATABASE_URL: z.url(),
    DATABASE_URL_UNPOOLED: z.url(),
    SEED: z.coerce.number().default(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    RESEND_API_KEY: z.string().min(1),
    EMAIL_FROM: z.string().min(1),
    EMAIL_REPLY_TO: z.email(),
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
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
