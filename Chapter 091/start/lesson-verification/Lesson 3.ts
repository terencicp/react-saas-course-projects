import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 3 — The happy-path webhook test.
//
// The deliverable this lesson asks for is itself a test file:
// `tests/integration/webhook-checkout-completed.int.test.ts`, which drives a
// signed `checkout.session.completed` through the real route handler and proves
// the rows it writes. That integration test needs real Postgres, the MSW Resend
// lifecycle, and the `@/db` rollback mock — none of which exist in this node-env
// `lesson` project, so we cannot execute it here.
//
// What we CAN verify, self-contained and DB-free, is that the student's test
// asserts on every contract surface the lesson exists to teach: the Response
// body, the `processed_events` ledger row, the `plan_entitlements` projection,
// the `audit_logs` row, and the untouched Resend boundary. We read the test as
// source text and check each surface is present. The integration run
// (`pnpm test:integration` → `1 passed`) is where the assertions actually
// execute against the database — these checks confirm they were written at all.
//
// `@/` is unused here on purpose: importing the integration test would pull in
// `withRollback`, the harness setup, and the real route (which imports
// `server-only`, unaliased in the lesson project) and crash on load. Reading the
// file as text keeps this gate independent of the harness.

// Read a project source file relative to the start|solution root. The base stays
// a URL so spaces and parens in this project path resolve correctly.
const readSource = (rel: string): string =>
  readFileSync(new URL(rel, new URL('../', import.meta.url)), 'utf8');

// The test under inspection. Read once; every requirement reads this same body.
// A still-stubbed start file (`describe.todo(...)`) trips the "not implemented"
// guard below before any surface assertion fires, so the failure reads as
// "you haven't written the test yet", not a confusing partial match.
const testFile = (): string =>
  readSource('tests/integration/webhook-checkout-completed.int.test.ts');

// Collapse whitespace so a multi-line `expect( … ).toMatchObject({ … })` matches
// the same regex as a single-line one — the student's formatting is theirs.
const flat = (s: string): string => s.replace(/\s+/g, ' ');

// True when the file contains a real, runnable test rather than the start stub.
// The stub is `describe.todo(...)` with no `it`; the solution has a live `it(`.
const isImplemented = (src: string): boolean =>
  !/describe\.todo/.test(src) && /\bit\s*\(/.test(src);

const NOT_IMPLEMENTED =
  'tests/integration/webhook-checkout-completed.int.test.ts is still the `describe.todo` stub. Write one `it(...)` inside the describe, wrapped in withRollback, that drives a signed checkout event through postWebhook and asserts on the rows it writes.';

describe('Requirement 1 — a valid checkout returns 200 with { received: true, duplicate: false }', () => {
  it('asserts the response status and body the route returns', () => {
    const src = flat(testFile());
    expect(/describe\.todo/.test(testFile()) === false, NOT_IMPLEMENTED).toBe(
      true,
    );

    // The act: the test must drive the event through the REAL route via
    // postWebhook (not call the handler internals directly).
    expect(
      /postWebhook\s*\(/.test(src),
      'The test never calls postWebhook(event). Drive the event through the real route handler with `const response = await postWebhook(event)` — calling dispatch/onCheckoutCompleted directly would prove nothing about the seam.',
    ).toBe(true);

    // The status assertion.
    expect(
      /\.status\b/.test(src) && /\b200\b/.test(src),
      'The test does not assert the response status is 200. Add `expect(response.status).toBe(200)`.',
    ).toBe(true);

    // The body shape: received true, duplicate false. Checked as a structural
    // match so field order / quoting does not matter.
    expect(
      /response\.json\s*\(\)/.test(src),
      'The test never reads response.json(). Assert the body with `await expect(response.json()).resolves.toMatchObject({ received: true, duplicate: false })`.',
    ).toBe(true);
    expect(
      /received\s*:\s*true/.test(src),
      'The response-body assertion is missing `received: true`. The route returns { received: true, duplicate: false } on a fresh delivery.',
    ).toBe(true);
    expect(
      /duplicate\s*:\s*false/.test(src),
      'The response-body assertion is missing `duplicate: false`. A first-time delivery is not a duplicate; lesson 4 covers the duplicate:true replay.',
    ).toBe(true);
  });
});

describe('Requirement 2 — the event is claimed exactly once in processed_events', () => {
  it('asserts one processed_events row for the event id with the provider and type', () => {
    const src = flat(testFile());
    expect(isImplemented(testFile()), NOT_IMPLEMENTED).toBe(true);

    // The ledger read must go through the transactional handle `tx`, never the
    // global db, or it cannot see the in-flight transaction the route wrote in.
    expect(
      /tx\.query\.processedEvents\.find/.test(src),
      'The test does not read processed_events through `tx`. Use `await tx.query.processedEvents.findMany({ where: eq(processedEvents.eventId, event.id) })` — a read off the global `db` sees a different connection and misses the in-flight rows.',
    ).toBe(true);

    // Exactly one claim.
    expect(
      /toHaveLength\s*\(\s*1\s*\)/.test(src),
      'The test does not assert the ledger has exactly one row. Add `expect(ledger).toHaveLength(1)` — the event must be claimed once, not zero or many times.',
    ).toBe(true);

    // Provider + event type on the claimed row.
    expect(
      /provider\s*:\s*['"`]stripe['"`]/.test(src),
      "The processed_events assertion is missing `provider: 'stripe'`. The claimed row records which provider the event came from.",
    ).toBe(true);
    expect(
      /eventType\s*:\s*['"`]checkout\.session\.completed['"`]/.test(src),
      "The processed_events assertion is missing `eventType: 'checkout.session.completed'`. The claimed row records the Stripe event type.",
    ).toBe(true);
  });
});

describe('Requirement 3 — plan_entitlements reflects the subscription, including lastEventAt', () => {
  it('asserts the projected plan, status, subscriptionId, cancelAtPeriodEnd, and the lastEventAt ordering column', () => {
    const src = flat(testFile());
    expect(isImplemented(testFile()), NOT_IMPLEMENTED).toBe(true);

    // Read the entitlement row through tx.
    expect(
      /tx\.query\.planEntitlements\.find/.test(src),
      'The test does not read plan_entitlements through `tx`. Use `await tx.query.planEntitlements.findFirst({ where: eq(planEntitlements.organizationId, org.id) })`.',
    ).toBe(true);

    expect(
      /plan\s*:\s*['"`]pro['"`]/.test(src),
      "The entitlement assertion is missing `plan: 'pro'`. A course_pro_monthly subscription must project to the pro plan.",
    ).toBe(true);
    expect(
      /status\s*:\s*['"`]trialing['"`]/.test(src),
      "The entitlement assertion is missing `status: 'trialing'`. The fixture subscription is in trial, so the projected status is trialing.",
    ).toBe(true);
    expect(
      /\bsubscriptionId\b/.test(src),
      'The entitlement assertion never checks subscriptionId. The projected row must carry the subscription id from the retrieved subscription.',
    ).toBe(true);
    expect(
      /cancelAtPeriodEnd\s*:\s*false/.test(src),
      'The entitlement assertion is missing `cancelAtPeriodEnd: false`. A freshly activated subscription is not set to cancel at period end.',
    ).toBe(true);

    // The load-bearing ordering proof. Without asserting lastEventAt equals
    // new Date(event.created * 1000), a regression in the route's
    // `WHERE lastEventAt < ?` ordering predicate could ship green.
    expect(
      /lastEventAt/.test(src),
      'The test never asserts lastEventAt. This is the ordering column the route compares stale-vs-fresh deliveries on — assert it, or an out-of-order regression ships green.',
    ).toBe(true);
    expect(
      /lastEventAt[\s\S]{0,80}new Date\s*\(\s*event\.created\s*\*\s*1000\s*\)/.test(
        src,
      ),
      'lastEventAt is not asserted to equal `new Date(event.created * 1000)`. Use `expect(entitlement?.lastEventAt).toEqual(new Date(event.created * 1000))` — the column must record the event timestamp, the basis for the ordering predicate.',
    ).toBe(true);
  });
});

describe('Requirement 4 — an audit_logs row records the activation with no acting user', () => {
  it('asserts the audit row action and that actorUserId is null', () => {
    const src = flat(testFile());
    expect(isImplemented(testFile()), NOT_IMPLEMENTED).toBe(true);

    expect(
      /tx\.query\.auditLogs\.find/.test(src),
      'The test does not read audit_logs through `tx`. Use `await tx.query.auditLogs.findMany({ where: eq(auditLogs.organizationId, org.id) })`.',
    ).toBe(true);
    expect(
      /action\s*:\s*['"`]billing\.subscription\.activated['"`]/.test(src),
      "The audit assertion is missing `action: 'billing.subscription.activated'`. The webhook activation must leave this audit trail.",
    ).toBe(true);
    expect(
      /actorUserId\s*:\s*null/.test(src),
      'The audit assertion is missing `actorUserId: null`. A webhook has no acting user — the audit row records null, not the seeded admin.',
    ).toBe(true);
  });
});

describe('Requirement 5 — no outbound email is triggered off the webhook path', () => {
  it('asserts resendCalls stays empty', () => {
    const src = flat(testFile());
    expect(isImplemented(testFile()), NOT_IMPLEMENTED).toBe(true);

    expect(
      /resendCalls/.test(src),
      'The test never references resendCalls. The webhook path sends no email (Unit 13 owns dispatch), so assert the boundary stays untouched.',
    ).toBe(true);
    expect(
      /resendCalls\s*\)\s*\.toHaveLength\s*\(\s*0\s*\)/.test(src) ||
        /expect\s*\(\s*resendCalls\s*\)[\s\S]{0,40}(toHaveLength\s*\(\s*0\s*\)|toEqual\s*\(\s*\[\s*\]\s*\))/.test(
          src,
        ),
      'The test does not assert resendCalls is empty. Add `expect(resendCalls).toHaveLength(0)` — proving no email fired off this path is a negative boundary check, not a second behavior.',
    ).toBe(true);
  });
});

describe('Constraint — the test is wrapped in withRollback so it leaves no state behind', () => {
  it('runs its body inside withRollback for per-test transaction rollback', () => {
    const src = flat(testFile());
    expect(isImplemented(testFile()), NOT_IMPLEMENTED).toBe(true);

    expect(
      /withRollback\s*\(/.test(src),
      'The test body is not wrapped in withRollback. Use `it(name, withRollback(async ({ tx }) => { ... }))` so every row it writes is rolled back and an immediate re-run still passes.',
    ).toBe(true);
    expect(
      /\(\s*\{\s*tx\s*\}\s*\)/.test(src),
      'The withRollback body does not destructure the `tx` handle. The body signature is `async ({ tx }) => { ... }`; reads and seeds must ride that transaction, not the global db.',
    ).toBe(true);
  });
});
