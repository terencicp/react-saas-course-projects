import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 6 ships ONE Playwright spec: tests/e2e/checkout-money-path.spec.ts — the
// browser test that drives the full Upgrade-to-Pro money path. Its real observable is
// browser state behind a live Stripe round-trip + webhook arrival, which no offline,
// node-env gate can drive. So this verifier reads the SPEC SOURCE and checks that each
// step the lesson claims as [tested] is actually expressed in the test the student
// writes — locators, the asserted URLs, and the asserted visible copy. Running the spec
// itself (`pnpm test:e2e`) is the *Moment of truth*; this gate just proves the spec
// asserts what it should before the student burns a ~60s browser run.

const SPEC_PATH = 'tests/e2e/checkout-money-path.spec.ts';

// Read the spec from the project root. This file lives in lesson-verification/, so one
// `../` reaches the project root, then SPEC_PATH descends into tests/e2e/. Keep the base
// a URL so a path with a space resolves cleanly (a bare string is not a valid URL base).
const readSpec = (): string =>
  readFileSync(new URL(`../${SPEC_PATH}`, import.meta.url), 'utf8');

// Comments are not behavior — the starter stub carries a one-line `// TODO(L6) …`
// summary of every step, which would false-match every check below. Strip line and
// block comments before asserting against what the test actually DOES.
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// A real test body, not the `test.fixme(... => {})` placeholder. fixme is how the starter
// ships an unwritten spec green; a completed spec uses `test(`, not `test.fixme(`.
const hasLiveTest = (src: string): boolean =>
  /\btest\s*\(/.test(src) && !/\btest\.fixme\s*\(/.test(src);

describe('Lesson 6 — Driving Checkout end to end (checkout-money-path.spec.ts)', () => {
  const raw = readSpec();
  const src = stripComments(raw);

  it('writes a live test rather than the test.fixme placeholder', () => {
    expect(
      hasLiveTest(src),
      'The spec is still the starter stub: `test.fixme(...)` with an empty body. ' +
        "Replace it with a real `test('admin can upgrade to Pro via Stripe Checkout', ...)` " +
        'that drives the money path.',
    ).toBe(true);
  });

  it('imports test/expect from the project fixtures, not @playwright/test directly', () => {
    // The 090 rule, reinforced here: specs go through ./fixtures so storageState (the
    // pre-authenticated adminPage) and shared data live in one place. Importing test or
    // expect straight from @playwright/test bypasses that wiring.
    const importsFromFixtures = /from\s+['"]\.\/fixtures['"]/.test(src);
    const importsTestFromPlaywright =
      /import\s*\{[^}]*\b(test|expect)\b[^}]*\}\s*from\s*['"]@playwright\/test['"]/.test(
        src,
      );
    expect(
      importsFromFixtures && !importsTestFromPlaywright,
      'Import `{ test, expect }` from `./fixtures` (not `@playwright/test`). ' +
        'Going direct skips the storageState wiring that gives you the pre-authed adminPage.',
    ).toBe(true);
  });

  // Req 1 — the e2e seed reads `free` on entry.
  it('asserts /inspector shows the entitlement-plan testid reading "free"', () => {
    const goesToInspector = /goto\(\s*['"]\/inspector['"]/.test(src);
    const readsPlanTestid =
      /getByTestId\(\s*['"]entitlement-plan['"]\s*\)/.test(src);
    const assertsFree = /toHaveText\(\s*['"]free['"]\s*\)/.test(src);
    expect(
      goesToInspector && readsPlanTestid && assertsFree,
      'Step 1 missing: go to `/inspector` and assert ' +
        "`getByTestId('entitlement-plan')` `toHaveText('free')` — the e2e seed's starting plan.",
    ).toBe(true);
  });

  // Req 2 — clicking Upgrade redirects to hosted Stripe Checkout.
  it('clicks "Upgrade to Pro" and asserts the browser lands on checkout.stripe.com', () => {
    const clicksUpgrade =
      /getByRole\(\s*['"]button['"][\s\S]*?upgrade to pro[\s\S]*?\)\s*\.click\(\)/i.test(
        src,
      );
    const assertsCheckoutUrl =
      /toHaveURL\([\s\S]*?checkout\\?\.stripe\\?\.com/i.test(src);
    expect(
      clicksUpgrade,
      'Step 2 missing: click the "Upgrade to Pro" button via a role-first locator ' +
        "(`getByRole('button', { name: /upgrade to pro/i })`).",
    ).toBe(true);
    expect(
      assertsCheckoutUrl,
      'Step 2 missing: after clicking Upgrade, assert the URL is on ' +
        '`checkout.stripe.com` (`toHaveURL(/checkout\\.stripe\\.com/)`).',
    ).toBe(true);
  });

  // Req 3 — fill the card iframe, submit, return to /billing/success.
  it('fills the Stripe card via the helper, submits, and asserts return to /billing/success', () => {
    const usesHelper = /\bfillStripeCard\s*\(/.test(src);
    const clicksSubmit =
      /getByRole\(\s*['"]button['"][\s\S]*?(start trial|subscribe|pay)[\s\S]*?\)\s*\.click\(\)/i.test(
        src,
      );
    const assertsSuccessUrl =
      /toHaveURL\([\s\S]*?\\?\/billing\\?\/success/.test(src);
    expect(
      usesHelper,
      'Step 3 missing: drive the Stripe card iframe through the provided ' +
        '`fillStripeCard(adminPage)` helper — do not re-implement the fragile iframe selectors.',
    ).toBe(true);
    expect(
      clicksSubmit,
      'Step 3 missing: click the Checkout submit button. Its label varies — use a regex ' +
        'that covers the trial case: `/(start trial|subscribe|pay)/i`.',
    ).toBe(true);
    expect(
      assertsSuccessUrl,
      'Step 3 missing: assert the browser returns to `/billing/success` after submitting.',
    ).toBe(true);
  });

  // Req 4 — the redirect-vs-webhook race window shows "finalizing".
  it('asserts the success page shows its "finalizing" copy during the webhook race', () => {
    const assertsFinalizing = /getByText\(\s*\/finalizing/i.test(src);
    expect(
      assertsFinalizing,
      'Step 4 missing: assert the "finalizing" copy is visible — the success page reads ' +
        '`free` and polls while the redirect races the webhook.',
    ).toBe(true);
  });

  // Req 5 — once the webhook lands, the poller flips to the success copy.
  it('asserts the page flips to the "you are all set / your plan is now pro" copy', () => {
    const assertsAllSet =
      /getByText\(\s*\/[^/]*you are all set[\s\S]*?your plan is now pro/i.test(
        src,
      ) ||
      /getByText\(\s*\/[^/]*(you are all set|your plan is now pro)/i.test(src);
    expect(
      assertsAllSet,
      'Step 5 missing: assert the poller flips the page to the success copy ' +
        '(`/you are all set|your plan is now pro/i`) once the webhook writes the entitlement.',
    ).toBe(true);
  });

  // Req 6 — the entitlement persisted: reload /inspector reads `pro`.
  it('reloads /inspector and asserts the entitlement-plan testid now reads "pro"', () => {
    const assertsPro = /toHaveText\(\s*['"]pro['"]\s*\)/.test(src);
    expect(
      assertsPro,
      'Step 6 missing: navigate back to `/inspector` and assert ' +
        "`getByTestId('entitlement-plan')` `toHaveText('pro')` — proof the entitlement persisted.",
    ).toBe(true);
  });

  // The constraint the lesson exists to teach: this E2E test asserts on BROWSER STATE
  // only. The integration suite already owns the plan_entitlements row write, so reaching
  // into the DB here covers the same bug at higher cost.
  it('asserts on browser state only — never reaches into the database', () => {
    const touchesDb =
      /from\s+['"]@\/db/.test(src) ||
      /\bplanEntitlements\b/.test(src) ||
      /\bgetTestDb\b/.test(src) ||
      /\bdrizzle\b/i.test(src);
    expect(
      touchesDb,
      'This E2E test must assert only on what the user sees in the browser. The ' +
        'integration suite owns the `plan_entitlements` row assertion — importing `@/db` or ' +
        'querying the table here duplicates that coverage at far higher cost.',
    ).toBe(false);
  });

  // No fixed sleeps — every wait is an auto-waiting matcher (toHaveURL/toHaveText/
  // toBeVisible). A waitForTimeout is the classic flaky-E2E smell this lesson warns against.
  it('uses auto-waiting matchers, not waitForTimeout', () => {
    expect(
      /waitForTimeout\s*\(/.test(src),
      'Drop `waitForTimeout` — it is the #1 source of flaky E2E tests. Rely on ' +
        'auto-waiting matchers (`toHaveURL`, `toHaveText`, `toBeVisible`) with a timeout option.',
    ).toBe(false);
  });
});
