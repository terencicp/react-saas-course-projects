import { expect, test as setup } from '@playwright/test';

// The `setup` project (runs before chromium). Authenticates the seeded admin once and
// persists the storage state to .auth/admin.json, which the chromium project reuses — so
// the money-path spec never repeats the login. Reads E2E_ADMIN_PASSWORD (from
// .env.test.local) to match the seeded credential.
//
// Authentication goes through Better Auth's sign-in endpoint (the same credential check
// the UI form's action runs server-side) rather than driving the sign-in form: under
// Playwright the form's React-Compiler-built useActionState submit is unreliable (the
// automated submit leaks React's internal action-encoding fields into the action's
// strict-parsed FormData), and API-based auth setup is the robust, recommended pattern.
// The session cookie the endpoint sets is what the saved storage state carries forward.

const ADMIN_FILE = '.auth/admin.json';

setup('authenticate as admin', async ({ page }) => {
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      'E2E_ADMIN_PASSWORD is not set (copy .env.test.local.example to .env.test.local)',
    );
  }

  const response = await page.request.post('/api/auth/sign-in/email', {
    data: { email: 'admin@e2e.test', password },
  });
  expect(response.ok()).toBe(true);

  // Confirm the session is live by loading the protected home (the request above set the
  // session cookie on the page's context).
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);

  await page.context().storageState({ path: ADMIN_FILE });
});
