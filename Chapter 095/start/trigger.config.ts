import { defineConfig } from '@trigger.dev/sdk/v3';

// The Trigger.dev v4 project config. The CLI (`pnpm trigger:dev` / `:deploy`)
// reads this file in its own Node context — NOT the Next.js bundle — so it reads
// process.env.TRIGGER_PROJECT_REF directly rather than importing `@/env` (whose
// `server-only` import throws outside a React Server context, exactly as the seed
// avoids `@/lib/auth`). The env block in `@/env` still validates the same ref for
// the app; this file is the build-time twin the worker bundler consumes.
//
// `maxDuration` is REQUIRED in v4: @trigger.dev/sdk@4.4.x types
// TriggerConfig.maxDuration as non-optional (tsc --noEmit fails without it) and the
// CLI throws "the maxDuration trigger.config option is now required, and must be at
// least 5 seconds" on dev/deploy. We ship the project-level cap (300s).
//
// Queues are NOT a config field in v4 — the export queue is declared at module
// scope in trigger/export-invoices.ts (`queue({ name, concurrencyLimit })`), never
// here. `dirs` points at the root-level ./trigger folder where the tasks live.
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_placeholder',
  dirs: ['./trigger'],
  runtime: 'node',
  maxDuration: 300,
  retries: {
    default: {
      maxAttempts: 3,
      factor: 1.8,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 60_000,
      randomize: true,
    },
  },
});
