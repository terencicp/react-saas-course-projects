import { afterAll, describe, expect, it, vi } from 'vitest';

// `@/lib/auth` (reached through the sign-in action) opens with `import 'server-only'`,
// a marker that throws the instant it loads outside the React Server runtime. Vitest's
// node env is not that runtime, so we swap it for an empty module before any of the
// student's code loads. Harness concern only — it changes no behaviour we assert on.
vi.mock('server-only', () => ({}));

// `@/lib/auth` and `@/db` validate `process.env` through `@/env` at module-load time
// and refuse to boot when a variable is missing. Vitest does not auto-load `.env`, so
// we load it first. The suite also talks to the same local Postgres the app uses (the
// `app` database) — it must be running with the auth tables migrated
// (`pnpm auth:generate` + `pnpm db:migrate`).
process.loadEnvFile(new URL('../../.env', import.meta.url));

// Public surface only: the student's sign-in action (the thing this lesson ships), the
// `auth` instance (to seed verified/unverified accounts the action then signs in), and
// the postgres driver to read the rows the action's success/failure leaves behind. We
// read the database directly (not through the student's `db` client) so the suite
// asserts the rows that landed, however they were wired.
const { signInAction } = await import('@/app/(auth)/sign-in/actions');
const { auth } = await import('@/lib/auth');
const { default: postgres } = await import('postgres');

const sql = postgres(process.env.DATABASE_URL as string);

// Fresh namespace per run so reruns never collide on the unique email index, and a
// stable prefix so afterAll can sweep every row the suite created. user→session and
// user→account FKs cascade, so deleting the user clears its session/account too.
const NS = `l4probe+${Date.now()}`;
const freshEmail = (tag: string) => `${NS}-${tag}@acme.test`;
const PASSWORD = 'correct-horse-battery-staple';

afterAll(async () => {
  await sql`delete from "user" where email like ${`${NS}-%@acme.test`}`;
  await sql.end();
});

// A successful sign-in ends in redirect(), which throws a Next.js "NEXT_REDIRECT"
// control-flow error rather than returning. We treat that throw as success and read
// the destination back off the digest. A non-redirect throw is a real bug — re-thrown.
const isRedirectError = (e: unknown): e is { digest: string } =>
  typeof e === 'object' &&
  e !== null &&
  'digest' in e &&
  typeof (e as { digest?: unknown }).digest === 'string' &&
  (e as { digest: string }).digest.startsWith('NEXT_REDIRECT');

// Drive the action and report what happened in a shape the tests can assert on: either
// it redirected (success) with its target, or it returned a Result (refusal / not-yet
// implemented). The redirect digest is "NEXT_REDIRECT;<type>;<url>;<status>;" — the
// destination is the segment that looks like a path, not a fixed index.
const runSignIn = async (
  fields: Record<string, string>,
): Promise<
  | { redirected: true; location: string | undefined }
  | { redirected: false; result: Awaited<ReturnType<typeof signInAction>> }
> => {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }

  try {
    const result = await signInAction(null, formData);
    return { redirected: false, result };
  } catch (e) {
    if (isRedirectError(e)) {
      const location = e.digest.split(';').find((part) => part.startsWith('/'));
      return { redirected: true, location };
    }
    throw e;
  }
};

// Seed a sign-in target. Sign-up writes the user + credential account; we flip
// emailVerified directly so the account is ready to sign in without driving the whole
// email-verification flow (that path is Lesson 3's concern, not this one).
const seedVerifiedUser = async (email: string) => {
  await auth.api.signUpEmail({
    body: { name: 'Ada Lovelace', email, password: PASSWORD },
  });
  await sql`update "user" set email_verified = true where email = ${email}`;
};

const sessionCount = async (email: string): Promise<number> => {
  const rows = await sql<{ c: number }[]>`
    select count(*)::int as c
    from session s join "user" u on u.id = s.user_id
    where u.email = ${email}`;
  return rows[0]?.c ?? 0;
};

// Requirement 1 / 4 / 5 — a verified account signs in and is returned to a sanitized
// destination: the bare success lands on /dashboard, a valid relative ?next= is
// honored, and a malicious ?next= is neutralized to /dashboard (never the attacker
// origin). One verified user drives every redirect-target assertion.
describe('a verified account signs in and lands on a sanitized destination', () => {
  it('redirects a correct sign-in to /dashboard by default', async () => {
    const email = freshEmail('ok');
    await seedVerifiedUser(email);

    const outcome = await runSignIn({ email, password: PASSWORD });

    expect(
      outcome.redirected,
      outcome.redirected
        ? ''
        : `A verified account's correct credentials must call auth.api.signInEmail and then redirect, but the action returned a Result (${JSON.stringify(
            outcome.redirected ? null : outcome.result,
          )}) instead. Is signInAction still the "Not implemented" stub, or is the redirect missing?`,
    ).toBe(true);

    if (!outcome.redirected) return;
    expect(
      outcome.location,
      `A sign-in with no ?next= must redirect to /dashboard — got '${outcome.location}'. The fallback is redirect((safeNext(next) ?? '/dashboard')).`,
    ).toBe('/dashboard');
  });

  it('honors a valid relative ?next= such as /dashboard/billing', async () => {
    const email = freshEmail('next-ok');
    await seedVerifiedUser(email);

    const outcome = await runSignIn({
      email,
      password: PASSWORD,
      next: '/dashboard/billing',
    });

    expect(
      outcome.redirected && outcome.location === '/dashboard/billing',
      `Signing in with ?next=/dashboard/billing must redirect there — got ${
        outcome.redirected
          ? `'${outcome.location}'`
          : `a Result ${JSON.stringify(outcome.redirected ? null : outcome.result)}`
      }. A same-origin path (starts with a single '/', no ':') must pass safeNext unchanged and reach redirect().`,
    ).toBe(true);
  });

  it('falls back to /dashboard for a protocol-relative or absolute ?next=', async () => {
    const email = freshEmail('next-evil');
    await seedVerifiedUser(email);

    const protocolRelative = await runSignIn({
      email,
      password: PASSWORD,
      next: '//evil.com',
    });
    expect(
      protocolRelative.redirected && protocolRelative.location === '/dashboard',
      `?next=//evil.com must be rejected and fall back to /dashboard — got ${
        protocolRelative.redirected
          ? `'${protocolRelative.location}'`
          : 'a non-redirect Result'
      }. A '//'-prefixed value is a protocol-relative URL the browser resolves to an external origin; safeNext must return undefined for it. This is the open-redirect closure.`,
    ).toBe(true);

    const absolute = await runSignIn({
      email,
      password: PASSWORD,
      next: 'https://evil.com',
    });
    expect(
      absolute.redirected && absolute.location === '/dashboard',
      `?next=https://evil.com must be rejected and fall back to /dashboard — got ${
        absolute.redirected ? `'${absolute.location}'` : 'a non-redirect Result'
      }. A value containing ':' (absolute URL or javascript:) must fail safeNext; never redirect to an external origin.`,
    ).toBe(true);
  });
});

// Requirement 2 — wrong-email and wrong-password collapse into ONE opaque message,
// byte-for-byte identical, with no tell as to which was wrong and no session issued.
// This is the account-enumeration defence and the load-bearing assertion of the lesson.
describe('wrong credentials are opaque and set no session', () => {
  it('returns a byte-identical message for a wrong email and a wrong password', async () => {
    const email = freshEmail('opaque');
    await seedVerifiedUser(email);

    // Wrong email: an address that maps to no account at all.
    const wrongEmail = await runSignIn({
      email: freshEmail('does-not-exist'),
      password: PASSWORD,
    });
    // Wrong password: the real account, the wrong secret.
    const wrongPassword = await runSignIn({
      email,
      password: 'definitely-not-the-password',
    });

    expect(
      wrongEmail.redirected,
      'A wrong email must NOT redirect — there is no session to issue. The action should catch the signInEmail failure and return a Result.',
    ).toBe(false);
    expect(
      wrongPassword.redirected,
      'A wrong password must NOT redirect — there is no session to issue. The action should catch the signInEmail failure and return a Result.',
    ).toBe(false);
    if (wrongEmail.redirected || wrongPassword.redirected) return;

    expect(
      wrongEmail.result?.ok,
      'A wrong email must return a non-ok Result so the form re-renders the error card.',
    ).toBe(false);
    expect(
      wrongPassword.result?.ok,
      'A wrong password must return a non-ok Result so the form re-renders the error card.',
    ).toBe(false);
    if (wrongEmail.result?.ok || wrongPassword.result?.ok) return;

    const emailMsg = wrongEmail.result?.error.userMessage;
    const passwordMsg = wrongPassword.result?.error.userMessage;

    expect(
      passwordMsg,
      `Wrong-email and wrong-password must produce the SAME message, with no hint as to which was wrong — got '${emailMsg}' vs '${passwordMsg}'. Both map to err('unauthorized', 'Invalid email or password.') via mapAuthError; any wording difference rebuilds the account-enumeration oracle.`,
    ).toBe(emailMsg);
  });

  it('issues no session for a wrong-password attempt on a real account', async () => {
    const email = freshEmail('nosession');
    await seedVerifiedUser(email);

    const before = await sessionCount(email);
    await runSignIn({ email, password: 'definitely-not-the-password' });
    const after = await sessionCount(email);

    expect(
      after,
      `A failed sign-in must issue no session — the account's session count went from ${before} to ${after}. signInEmail only creates a session on a successful credential match; a new row here means a failure path is signing the user in.`,
    ).toBe(before);
  });
});

// Requirement 3 — an account whose email is unverified is refused with a
// safe-to-distinguish "verify your email" message (a 'forbidden' Result the form turns
// into the inline resend link), and still issues no session. The refusal is produced by
// requireEmailVerification surfacing as EMAIL_NOT_VERIFIED, mapped to 'forbidden' — not
// by an explicit branch in the action.
describe('an unverified account is refused with the resend variant', () => {
  it("refuses with a 'forbidden' Result distinct from the wrong-credentials message", async () => {
    const email = freshEmail('unverified');
    // Sign up only — do NOT flip emailVerified. The account exists, password matches,
    // but the email is unproven.
    await auth.api.signUpEmail({
      body: { name: 'Grace Hopper', email, password: PASSWORD },
    });

    const outcome = await runSignIn({ email, password: PASSWORD });

    expect(
      outcome.redirected,
      'An unverified account must NOT be signed in — the action must not redirect even though the password matched. requireEmailVerification refuses it after the credential check.',
    ).toBe(false);
    if (outcome.redirected) return;

    expect(
      outcome.result?.ok,
      'An unverified sign-in must return a non-ok Result so the form shows the inline message and resend link.',
    ).toBe(false);
    if (outcome.result?.ok) return;

    expect(
      outcome.result?.error.code,
      `An unverified account must come back as 'forbidden' — got '${outcome.result?.error.code}'. The form keys its resend-verification link on error.code === 'forbidden'; Better Auth raises EMAIL_NOT_VERIFIED, which mapAuthError turns into forbidden.`,
    ).toBe('forbidden');
  });

  it('issues no session for an unverified sign-in attempt', async () => {
    const email = freshEmail('unverified-nosession');
    await auth.api.signUpEmail({
      body: { name: 'Edsger', email, password: PASSWORD },
    });

    const before = await sessionCount(email);
    await runSignIn({ email, password: PASSWORD });
    const after = await sessionCount(email);

    expect(
      after,
      `An unverified sign-in must issue no session — the count went from ${before} to ${after}. The refusal happens before any session is created; a new row means an unverified user is being signed in.`,
    ).toBe(before);
  });
});
