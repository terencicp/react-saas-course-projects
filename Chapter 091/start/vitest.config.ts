import { fileURLToPath } from 'node:url';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// The route transitively imports `server-only` (via lib/billing/stripe.ts,
// lib/webhooks/**, db/audit-log.ts), which throws under the Node test env. Alias it
// (and client-only) to an empty module so the integration tests can import the real
// handler. The alias lives ONLY on the integration project — the lesson project never
// imports app code.
const emptyModule = fileURLToPath(
  new URL('./src/test/empty-module.ts', import.meta.url),
);

// Two Vitest projects. In Vitest 4 the root `plugins` do NOT propagate into
// `test.projects`, so `vite-tsconfig-paths` (the `@/` alias resolver) MUST live inside
// EACH project's `plugins` — a root-only placement leaves every `@/…` import unresolved.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [tsconfigPaths()],
        test: {
          name: 'lesson',
          environment: 'node',
          globals: false,
          include: ['lesson-verification/**/*.ts'],
        },
      },
      {
        plugins: [tsconfigPaths()],
        resolve: {
          alias: { 'server-only': emptyModule, 'client-only': emptyModule },
        },
        test: {
          name: 'integration',
          environment: 'node',
          globals: false,
          include: ['tests/integration/**/*.int.test.ts'],
          setupFiles: ['./src/test/integration-setup.ts'],
          // The test DB is one schema shared across files; isolation is per-test
          // withRollback, not per-worker — so files run one at a time.
          fileParallelism: false,
        },
      },
    ],
  },
});
