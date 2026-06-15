import { expect, test } from './fixtures';
import { fillStripeCard } from './helpers/fill-stripe-card';

// The one E2E money path: the composition no integration test can reach — auth +
// upgrade action + Stripe Checkout round-trip + webhook arrival + the success-page
// poll flipping to Pro. It asserts on BROWSER STATE only (testids + visible copy on
// the carried 065 surfaces); the integration suite owns the DB-row assertion, so
// re-asserting it here would cover the same bug at higher cost.
//
// Entry is /inspector (the carried app has no /billing page; the Upgrade control is
// the inspector's checkout-pro-button) and the return lands on /billing/success.
// adminPage arrives pre-authenticated via the storageState the setup project wrote.
// No waitForTimeout — every wait is an auto-waiting matcher.

test('admin can upgrade to Pro via Stripe Checkout', async ({ adminPage }) => {
  await adminPage.goto('/inspector');
  await expect(adminPage.getByTestId('entitlement-plan')).toHaveText('free');

  await adminPage.getByRole('button', { name: /upgrade to pro/i }).click();
  await expect(adminPage).toHaveURL(/checkout\.stripe\.com/);

  await fillStripeCard(adminPage);
  // Stripe labels the submit "Start trial" with a trial (065 sets trial_period_days:
  // 14) and "Subscribe"/"Pay" without one — the regex covers both.
  await adminPage
    .getByRole('button', { name: /(start trial|subscribe|pay)/i })
    .click();

  await expect(adminPage).toHaveURL(/\/billing\/success/, { timeout: 30_000 });
  // The redirect-vs-webhook race window: the success page reads `free` and polls.
  await expect(adminPage.getByText(/finalizing/i)).toBeVisible();
  // The Poller router.refreshes until the webhook lands and the projection reads pro.
  await expect(
    adminPage.getByText(/you are all set|your plan is now pro/i),
  ).toBeVisible({ timeout: 30_000 });

  await adminPage.goto('/inspector');
  await expect(adminPage.getByTestId('entitlement-plan')).toHaveText('pro');
});
