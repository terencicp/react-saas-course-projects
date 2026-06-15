import { defineConfig, devices } from '@playwright/test';

// The E2E config drives a PRODUCTION build (never `next dev`) on port 3001 against the
// dedicated `saas_e2e` Postgres. The `setup` project signs in once and writes
// `.auth/admin.json`; `chromium` depends on it and reuses that storageState, so the
// money-path spec never re-logs-in. Chromium-only by default — WebKit/Firefox are CI
// cost discipline (named-not-built).
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['github'], ['html']],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm build && pnpm start -p 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_E2E ?? '',
      DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_E2E ?? '',
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? '',
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? '',
      APP_URL: process.env.APP_URL ?? 'http://localhost:3001',
    },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: '.auth/admin.json' },
    },
  ],
});
