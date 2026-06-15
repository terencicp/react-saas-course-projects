import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: { AI_GATEWAY_API_KEY: z.string().min(1) },
  experimental__runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  // The AI SDK reads AI_GATEWAY_API_KEY from process.env at call time; no test or
  // rendered check exercises a live model call. Set a real key in .env only for
  // the manual Moments of truth. `next build` runs with NODE_ENV='production', so
  // the `NODE_ENV !== 'production'` arm does NOT skip during the build — the
  // SKIP_ENV_VALIDATION=true the `verify` script sets is what keeps `pnpm verify`
  // green without a real key if any build-graph module imports `env`.
  skipValidation:
    process.env.NODE_ENV !== 'production' ||
    process.env.SKIP_ENV_VALIDATION === 'true',
});
