import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// `src/lib/suppressions.ts` and `src/lib/email.ts` begin with `import 'server-only'`,
// which throws the moment it is imported outside the React Server runtime. Vitest's
// node env is not that runtime, so we replace the marker with an empty module before
// any of the student's code loads. This is a test-harness concern only — it does not
// touch the behaviour under test.
vi.mock('server-only', () => ({}));

// The env boundary (`@/env`) reads `process.env` at module-load time and refuses to
// boot when a variable is missing. Vitest does not auto-load `.env`, so we load it
// here before importing anything that reaches the env. Requires a running local
// Postgres seeded with `pnpm db:seed` (the suppressed@… row the suite relies on).
process.loadEnvFile(new URL('../../.env', import.meta.url));

// Public surface only: the student's helpers, the db client, and drizzle for the
// rows the suite inserts/cleans up. No reaching into internals by path.
const { isSuppressed } = await import('@/lib/suppressions');
const { sendEmail } = await import('@/lib/email');
const { db } = await import('@/db/index');
const { emailSuppressions } = await import('@/db/schema');
const { eq } = await import('drizzle-orm');

// Seeded by `pnpm db:seed` — present before the suite runs.
const SEEDED_SUPPRESSED = 'suppressed@send.acme.example';
const UNRELATED = 'someone-not-on-the-list@example.com';

// Rows this suite owns: inserted in beforeAll, removed in afterAll so reruns stay clean.
const BYPASS_ADDRESS = 'lesson3-bypass-probe@send.acme.example';
const UNSUB_ADDRESS = 'lesson3-unsubscribe-probe@send.acme.example';

beforeAll(async () => {
  await db
    .delete(emailSuppressions)
    .where(eq(emailSuppressions.email, BYPASS_ADDRESS));
  await db
    .delete(emailSuppressions)
    .where(eq(emailSuppressions.email, UNSUB_ADDRESS));

  // A row whose bypass window is still open (one hour out). Reason is irrelevant —
  // an active window must override the reason check.
  await db.insert(emailSuppressions).values({
    email: BYPASS_ADDRESS,
    reason: 'hard_bounce',
    bypassUntil: new Date(Date.now() + 60 * 60 * 1000),
  });

  // A manual unsubscribe: must block marketing but never block transactional.
  await db.insert(emailSuppressions).values({
    email: UNSUB_ADDRESS,
    reason: 'manual_unsubscribe',
  });
});

afterAll(async () => {
  await db
    .delete(emailSuppressions)
    .where(eq(emailSuppressions.email, BYPASS_ADDRESS));
  await db
    .delete(emailSuppressions)
    .where(eq(emailSuppressions.email, UNSUB_ADDRESS));
});

// Requirement 1 — isSuppressed reports the seeded address as suppressed and an
// unrelated address as clear.
describe('isSuppressed reads the suppression list', () => {
  it('reports the seeded suppressed address as suppressed', async () => {
    const result = await isSuppressed(SEEDED_SUPPRESSED, {
      kind: 'transactional',
    });

    expect(
      result.suppressed,
      'The seeded address is on the suppression list but isSuppressed reported it as clear — the helper is not querying email_suppressions yet (still the no-op stub?).',
    ).toBe(true);
  });

  it('reports an unrelated address as clear', async () => {
    const result = await isSuppressed(UNRELATED, { kind: 'transactional' });

    expect(
      result.suppressed,
      'An address with no row in email_suppressions must be clear; isSuppressed reported it as suppressed.',
    ).toBe(false);
  });
});

// Requirement 2 — isSuppressed normalizes (trim + lowercase) before querying, so
// casing/whitespace cannot slip past the gate.
describe('isSuppressed normalizes the email before querying', () => {
  it('matches the seeded row despite stray casing and whitespace', async () => {
    const messy = `  ${SEEDED_SUPPRESSED.toUpperCase()}  `;

    const result = await isSuppressed(messy, { kind: 'transactional' });

    expect(
      result.suppressed,
      'A trimmed + lowercased variant of the seeded address slipped past the gate — isSuppressed must normalize (email.trim().toLowerCase()) before the lookup, since the unique index stores the normalized form.',
    ).toBe(true);
  });
});

// Requirement 3 — an active bypassUntil window reports the recipient as not suppressed.
describe('isSuppressed honours an active bypass window', () => {
  it('reports a recipient with an open bypassUntil as not suppressed', async () => {
    const result = await isSuppressed(BYPASS_ADDRESS, {
      kind: 'transactional',
    });

    expect(
      result.suppressed,
      'A row whose bypassUntil is in the future must read as not suppressed — the bypass window has to be checked (and beat the reason check) inside isSuppressed.',
    ).toBe(false);
  });
});

// Requirement 4 — a manual_unsubscribe row lets a transactional recipient through
// while still suppressing a marketing recipient.
describe('isSuppressed applies the manual_unsubscribe carve-out', () => {
  it('does not suppress a transactional recipient', async () => {
    const result = await isSuppressed(UNSUB_ADDRESS, { kind: 'transactional' });

    expect(
      result.suppressed,
      'manual_unsubscribe must never block transactional mail (verification, receipts) — the kind: "transactional" carve-out is missing.',
    ).toBe(false);
  });

  it('still suppresses a marketing recipient', async () => {
    const result = await isSuppressed(UNSUB_ADDRESS, { kind: 'marketing' });

    expect(
      result.suppressed,
      'manual_unsubscribe must still block marketing mail — the carve-out should apply only when kind is "transactional".',
    ).toBe(true);
  });
});

// Requirement 5 — sendEmail short-circuits a suppressed recipient with
// err('forbidden', …) before any Resend call. RESEND_API_KEY is the placeholder
// 're_xxx', so a real send would fail with 'internal'; reaching 'forbidden' proves
// the gate returned before the SDK was touched.
describe('sendEmail gates a suppressed recipient before sending', () => {
  it("returns err('forbidden', …) without calling Resend", async () => {
    const result = await sendEmail({
      to: SEEDED_SUPPRESSED,
      subject: 'Welcome',
      react: null,
      idempotencyKey: 'lesson3:forbidden-probe',
    });

    expect(
      result.ok,
      'sendEmail returned ok:true for a suppressed recipient — the suppression read at the wrapper edge is missing or runs after the Resend call.',
    ).toBe(false);

    if (result.ok) return;
    expect(
      result.error.code,
      `Expected the suppression hit to reuse the 'forbidden' code (reaching the Resend call with the placeholder key would have produced 'internal' instead) — got '${result.error.code}'. The short-circuit must return before resend.emails.send.`,
    ).toBe('forbidden');
    expect(result.error.userMessage).toBe(
      'This recipient is on the suppression list.',
    );
  });
});

// Requirement 6 — sendEmail fails closed: if the suppression read throws, it returns
// err('internal', 'Could not send email.') before any send. We force isSuppressed to
// throw via an isolated module mock so no DB outage is needed.
describe('sendEmail fails closed when the suppression read throws', () => {
  it("returns err('internal', 'Could not send email.') and never sends", async () => {
    vi.resetModules();
    vi.doMock('server-only', () => ({}));
    vi.doMock('@/lib/suppressions', () => ({
      isSuppressed: async () => {
        throw new Error('suppression read failed');
      },
    }));

    const { sendEmail: sendEmailWithBrokenRead } = await import('@/lib/email');

    const result = await sendEmailWithBrokenRead({
      to: UNRELATED,
      subject: 'Welcome',
      react: null,
      idempotencyKey: 'lesson3:fail-closed-probe',
    });

    vi.doUnmock('@/lib/suppressions');
    vi.resetModules();

    expect(
      result.ok,
      'When the suppression read throws, sendEmail must fail closed (assume suppressed) — it returned a success or proceeded to send instead.',
    ).toBe(false);

    if (result.ok) return;
    expect(
      result.error.code,
      `A thrown suppression read must be caught and turned into err('internal', 'Could not send email.') — got code '${result.error.code}'. Wrap the isSuppressed call in try/catch and return before any Resend call.`,
    ).toBe('internal');
    expect(result.error.userMessage).toBe('Could not send email.');
  });
});

// Requirement 7 — sendEmail is importable with its full signature
// (to, subject, react, required idempotencyKey, optional replyTo, optional
// bypassSuppression) returning Result<{ id: string }>. The typed call below is
// checked by `tsc --noEmit` (pnpm verify); at runtime we confirm it is callable and
// returns the Result shape. We target the seeded suppressed recipient with
// bypassSuppression:false so the gate short-circuits before Resend — the suite never
// performs a real network send.
describe('sendEmail exposes its full signature', () => {
  it('accepts every documented field and returns a Result', async () => {
    expect(
      typeof sendEmail,
      'sendEmail must be exported as a function from src/lib/email.ts.',
    ).toBe('function');

    const result = await sendEmail({
      to: SEEDED_SUPPRESSED,
      subject: 'Welcome',
      react: null,
      idempotencyKey: 'lesson3:signature-probe',
      replyTo: 'support@acme.example',
      bypassSuppression: false,
    });

    expect(
      typeof result.ok,
      'sendEmail must return a Result ({ ok: boolean, ... }) rather than throwing on expected failures.',
    ).toBe('boolean');
  });
});
