import { expect, type Page } from '@playwright/test';

// The ONE fragile third-party seam, centralized: reaching the hosted Stripe Checkout
// card fields. Stripe owns these selectors and changes them without notice, so keeping
// them in this single helper means a break is a one-file fix — the spec inlines this
// logic conceptually but imports the helper.
//
// The #1 Stripe-iframe flake is interacting before the iframe paints, so every field is
// reached through an auto-waiting expect(...).toBeVisible() first (no waitForTimeout).
//
// Selector pair confirmed against current Stripe Checkout (June 2026):
//   - frame:  iframe[src*="js.stripe.com"]  (Checkout embeds card entry in a js.stripe.com frame)
//   - fields: getByPlaceholder(...) — Checkout's accessible placeholders are stable
//             across the data-elements-stable-field-name churn.
// If Stripe changes the layout, update HERE only.
export const fillStripeCard = async (
  page: Page,
  card = '4242 4242 4242 4242',
): Promise<void> => {
  const frame = page.frameLocator('iframe[src*="js.stripe.com"]').first();

  const cardInput = frame.getByPlaceholder(/card number/i);
  await expect(cardInput).toBeVisible({ timeout: 30_000 });
  await cardInput.fill(card);

  await frame.getByPlaceholder(/mm \/ yy/i).fill('12 / 34');
  await frame.getByPlaceholder(/cvc/i).fill('123');

  // ZIP is present for US-style Checkout; fill it when shown (best-effort, the field is
  // not always rendered).
  const zip = frame.getByPlaceholder(/zip|postal/i);
  if (await zip.count()) {
    await zip.fill('12345');
  }
};
