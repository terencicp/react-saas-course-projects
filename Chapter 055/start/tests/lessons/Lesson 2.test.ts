import { afterAll, describe, expect, it, vi } from 'vitest';

// The sign-up action reaches `@/lib/auth`, whose first line is `import 'server-only'`.
// That marker throws the instant it loads outside the React Server runtime, and
// Vitest's node env is not that runtime — so we swap it for an empty module before
// any of the student's code loads. Harness concern only; it does not touch behaviour.
vi.mock('server-only', () => ({}));

// `@/lib/auth` and `@/db` read their config through `@/env`, which validates
// `process.env` at module-load time and refuses to boot when a variable is missing.
// Vitest does not auto-load `.env`, so we load it here first. The suite also talks to
// the same local Postgres the app uses (the `app` database), so it must be running
// with the auth tables migrated (`pnpm auth:generate` + `pnpm db:migrate`).
process.loadEnvFile(new URL('../../.env', import.meta.url));

// Public surface only: the student's server action and the postgres driver for the
// rows the action is expected to write. We read the database directly (not through
// the student's `db` client) so the suite does not depend on the auth schema being
// spread into `@/db` yet — it asserts the rows that landed, however they were wired.
const { signUpAction } = await import('@/app/(auth)/sign-up/actions');
const { default: postgres } = await import('postgres');

const sql = postgres(process.env.DATABASE_URL as string);

// A redirect() from a server action throws a Next.js "NEXT_REDIRECT" control-flow
// error rather than returning. The happy path of sign-up ends in exactly that, so we
// treat a NEXT_REDIRECT throw as success and surface its target for assertions.
const isRedirectError = (e: unknown): e is { digest: string } =>
  typeof e === 'object' &&
  e !== null &&
  'digest' in e &&
  typeof (e as { digest?: unknown }).digest === 'string' &&
  (e as { digest: string }).digest.startsWith('NEXT_REDIRECT');

// Run the action and report what happened in a shape the tests can assert on:
// either it redirected (happy path) or it returned a Result (validation / not-yet
// implemented). Anything else (a non-redirect throw) is re-thrown — that is a real
// bug the student should see, not something to swallow.
const runSignUp = async (
  fields: Record<string, string>,
): Promise<
  | { redirected: true; location: string | undefined }
  | { redirected: false; result: Awaited<ReturnType<typeof signUpAction>> }
> => {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }

  try {
    const result = await signUpAction(null, formData);
    return { redirected: false, result };
  } catch (e) {
    if (isRedirectError(e)) {
      // Next's digest is "NEXT_REDIRECT;<type>;<url>;<status>;" — the destination
      // is the segment that looks like a path, not a fixed index.
      const location = e.digest.split(';').find((part) => part.startsWith('/'));
      return { redirected: true, location };
    }
    throw e;
  }
};

// Fresh address per run so reruns never collide on the unique email index, and a
// stable namespace so afterAll can sweep every row the suite created.
const NS = `l2probe+${Date.now()}`;
const freshEmail = (tag: string) => `${NS}-${tag}@acme.test`;
const PASSWORD = 'correct-horse-battery-staple';

afterAll(async () => {
  // user→account FK cascades, so deleting the user removes its account too.
  await sql`delete from "user" where email like ${`${NS}-%@acme.test`}`;
  await sql.end();
});

// Requirement 1 — a fresh sign-up creates a user row with emailVerified = false.
describe('sign-up creates an unverified user', () => {
  it('writes a user row whose emailVerified is false', async () => {
    const email = freshEmail('user');

    const outcome = await runSignUp({
      name: 'Ada Lovelace',
      email,
      password: PASSWORD,
    });

    expect(
      outcome.redirected,
      outcome.redirected
        ? ''
        : `A valid sign-up must call auth.api.signUpEmail and then redirect, but the action returned a Result (${JSON.stringify(
            outcome.result,
          )}) instead. Is signUpAction still the "Not implemented" stub, or is the redirect missing?`,
    ).toBe(true);

    const rows = await sql`
      select email_verified from "user" where email = ${email}`;

    expect(
      rows.length,
      'No user row was created for the submitted email. signUpAction must call auth.api.signUpEmail({ body: { name, email, password } }) so Better Auth inserts the user row.',
    ).toBe(1);

    expect(
      rows[0]?.email_verified,
      'The new user row must start unverified (emailVerified = false): requireEmailVerification is on, so sign-up never marks the email verified. Check emailAndPassword.requireEmailVerification: true in the auth config.',
    ).toBe(false);
  });
});

// Requirement 2 — the same submission creates a credential account with a scrypt
// hash, and writes no verification row (the token is a stateless JWT in the URL).
describe('sign-up creates a credential account and no verification row', () => {
  it("writes an account with providerId 'credential' and a scrypt password hash", async () => {
    const email = freshEmail('account');

    await runSignUp({ name: 'Grace Hopper', email, password: PASSWORD });

    const rows = await sql`
      select a.provider_id, a.password
      from account a
      join "user" u on u.id = a.user_id
      where u.email = ${email}`;

    expect(
      rows.length,
      'No account row was created for the new user. Email+password sign-up must produce a row in the account table linked to the user (Better Auth writes it via signUpEmail).',
    ).toBe(1);

    expect(
      rows[0]?.provider_id,
      `The account row must use providerId 'credential' for an email+password account — got '${rows[0]?.provider_id}'. This is set by Better Auth's emailAndPassword provider; confirm emailAndPassword.enabled is true.`,
    ).toBe('credential');

    const password = String(rows[0]?.password ?? '');
    expect(
      /^[0-9a-f]+:/.test(password) && password.length > 40,
      `The stored password must be a scrypt hash ("<hex-salt>:<hash>"), never the plaintext — got "${password.slice(
        0,
        24,
      )}…". If this looks like the raw password, the credential provider is not hashing.`,
    ).toBe(true);

    const verification = await sql`
      select count(*)::int as c from verification where identifier = ${email}`;

    expect(
      verification[0]?.c,
      'Sign-up must not write a verification row: in this Better Auth version the email-verification token is a stateless signed JWT carried in the verify URL, not a database row. A row here means something is persisting the token unexpectedly.',
    ).toBe(0);
  });
});

// Requirement 3 — invalid input is rejected at the boundary: the action returns a
// validation Result (so the form re-renders an inline message) and writes no rows.
describe('sign-up rejects invalid input without writing rows', () => {
  it('rejects a password shorter than 12 characters', async () => {
    const email = freshEmail('shortpw');

    const outcome = await runSignUp({
      name: 'Edsger',
      email,
      password: 'short',
    });

    expect(
      outcome.redirected,
      'A too-short password must be rejected before any account is created — the action must not redirect. Parse the form with the SignUpSchema (password min 12) before calling Better Auth.',
    ).toBe(false);

    if (outcome.redirected) return;
    expect(
      outcome.result?.ok,
      'A rejected sign-up must return a non-ok Result so the form can re-render an inline error, not throw or succeed.',
    ).toBe(false);

    if (outcome.result?.ok) return;
    expect(
      outcome.result?.error.code,
      `An invalid password must come back as a 'validation' error (drives the inline FieldError) — got '${outcome.result?.error.code}'. Return err('validation', …, fieldErrors) on a failed safeParse.`,
    ).toBe('validation');

    expect(
      outcome.result?.error.fieldErrors?.password?.length,
      'The validation Result must carry a per-field message under fieldErrors.password so <FieldError name="password"> can render it. Pass z.flattenError(parsed.error).fieldErrors to err().',
    ).toBeGreaterThan(0);

    const rows = await sql`select 1 from "user" where email = ${email}`;
    expect(
      rows.length,
      'A rejected sign-up must create no rows — a user row exists for an email whose password failed validation. Validation has to run (and return) before auth.api.signUpEmail.',
    ).toBe(0);
  });

  it('rejects a malformed email address', async () => {
    const outcome = await runSignUp({
      name: 'Alan',
      email: 'not-an-email',
      password: PASSWORD,
    });

    expect(
      outcome.redirected,
      'A malformed email must be rejected before any account is created — the action must not redirect. The SignUpSchema email check should fail safeParse.',
    ).toBe(false);

    if (outcome.redirected) return;
    expect(
      outcome.result?.ok,
      'A malformed email must return a non-ok validation Result.',
    ).toBe(false);

    if (outcome.result?.ok) return;
    expect(
      outcome.result?.error.code,
      `A malformed email must come back as a 'validation' error — got '${outcome.result?.error.code}'.`,
    ).toBe('validation');

    const rows =
      await sql`select 1 from "user" where email = ${'not-an-email'}`;
    expect(rows.length, 'A malformed-email sign-up must create no rows.').toBe(
      0,
    );
  });
});

// Requirement 4 — a taken email follows the same generic success path as a fresh one:
// no "email already exists" tell, no crash. This is the enumeration defence — under
// autoSignIn:false, signUpEmail returns generic success for a duplicate.
describe('sign-up is enumeration-safe for a taken email', () => {
  it('re-submitting an existing email redirects like a fresh sign-up, with no conflict tell', async () => {
    const email = freshEmail('dup');

    // First sign-up establishes the account.
    const first = await runSignUp({ name: 'Ada', email, password: PASSWORD });
    expect(
      first.redirected,
      'Setup: the first sign-up with this email should redirect (succeed) before we test the duplicate path.',
    ).toBe(true);

    // Second sign-up with the same email must look identical to the caller.
    const second = await runSignUp({ name: 'Ada', email, password: PASSWORD });

    expect(
      second.redirected,
      second.redirected
        ? ''
        : `A repeat sign-up with a taken email must follow the same generic success path (redirect to /verify-email), but the action returned ${JSON.stringify(
            second.result,
          )}. Do NOT add an "email already exists" branch — under autoSignIn:false a duplicate returns generic success, and a conflict error here would rebuild the enumeration oracle.`,
    ).toBe(true);

    if (second.redirected) {
      expect(
        second.location?.includes('/verify-email'),
        `A duplicate sign-up must redirect to /verify-email (same as a fresh one) — got '${second.location}'.`,
      ).toBe(true);
    }
  });
});
