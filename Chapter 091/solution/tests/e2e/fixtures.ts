import { test as base, type Page } from '@playwright/test';

// The project's Playwright fixtures. Specs import { test, expect } from HERE, never from
// '@playwright/test' directly (the 090 rule) — so the storageState wiring and shared
// data live in one place.
//
//   - adminPage: a Page already authenticated as the seeded admin via the storageState
//     the `setup` project wrote (.auth/admin.json). The money-path spec uses it to reach
//     /inspector without logging in.
//   - orgSlug: the seeded e2e org slug, for any route that needs it.
type Fixtures = {
  adminPage: Page;
  orgSlug: string;
};

export const test = base.extend<Fixtures>({
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: '.auth/admin.json',
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  // A constant fixture — Playwright accepts a plain value as the default.
  orgSlug: 'e2e-org',
});

export { expect } from '@playwright/test';
