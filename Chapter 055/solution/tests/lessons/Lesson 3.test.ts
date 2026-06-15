import { afterAll, describe, expect, it, vi } from 'vitest';

// `@/lib/auth` opens with `import 'server-only'`, a marker that throws the instant
// it loads outside the React Server runtime. Vitest's node env is not that runtime,
// so we swap it for an empty module before any of the student's code loads. Harness
// concern only — it changes no behaviour we assert on.
vi.mock('server-only', () => ({}));

// `@/lib/auth`, `@/db`, and `@/lib/email` validate `process.env` through `@/env` at
// module-load time and refuse to boot when a variable is missing. Vitest does not
// auto-load `.env`, so we load it first. The suite also talks to the same local
// Postgres the app uses (the `app` database) — it must be running with the auth
// tables migrated (`pnpm auth:generate` + `pnpm db:migrate`).
process.loadEnvFile(new URL('../../.env', import.meta.url));

// The verification link is never delivered to a real inbox in a test, so we stand
// in for the Resend boundary: replace `sendEmail` with a spy that records every
// call and reports success. This captures the React element the `sendVerificationEmail`
// callback builds — whose `verifyUrl` prop carries the signed-JWT link we need to
// drive the verify callback — without sending anything. We do NOT assert on the
// email's rendered shape here (heading/CTA/fallback are confirmed by hand in the
// lesson); we only need the url it was handed.
type CapturedSend = { to?: string; react?: { props?: { verifyUrl?: string } } };
const sentEmails: CapturedSend[] = [];
vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>();
  return {
    ...actual,
    sendEmail: vi.fn(async (input: CapturedSend) => {
      sentEmails.push(input);
      return { ok: true as const, data: { id: 'test-email-id' } };
    }),
  };
});

// Public surface only: the student's `auth` instance (the server API the verify flow
// runs through) and the postgres driver for the rows the flow is expected to write.
// We read the database directly (not through the student's `db` client) so the suite
// asserts the rows that landed, however they were wired.
const { auth } = await import('@/lib/auth');
const { default: postgres } = await import('postgres');

const sql = postgres(process.env.DATABASE_URL as string);

// Fresh namespace per run so reruns never collide on the unique email index, and a
// stable prefix so afterAll can sweep every row the suite created. user→session and
// user→account FKs cascade, so deleting the user clears its session/account too.
const NS = `l3probe+${Date.now()}`;
const freshEmail = (tag: string) => `${NS}-${tag}@acme.test`;
const PASSWORD = 'correct-horse-battery-staple';

afterAll(async () => {
  await sql`delete from "user" where email like ${`${NS}-%@acme.test`}`;
  await sql.end();
});

// Sign a user up and verify them end to end, returning the user id and the url the
// verification email was built around. Throws a readable error at each stage that
// can break — the student should see *which* link in the chain is missing.
const signUpAndVerify = async (email: string) => {
  const before = sentEmails.length;

  // signUpEmail triggers sendOnSignUp → sendVerificationEmail → our sendEmail spy.
  await auth.api.signUpEmail({
    body: { name: 'Ada Lovelace', email, password: PASSWORD },
  });

  const captured = sentEmails.slice(before);
  if (captured.length === 0) {
    throw new Error(
      'Sign-up sent no verification email. The auth config needs an `emailVerification` block ' +
        'with `sendOnSignUp: true` and a `sendVerificationEmail` callback that calls `sendEmail`. ' +
        'Without it, /verify-email is a dead end and nothing can be verified.',
    );
  }

  const verifyUrl = captured.at(-1)?.react?.props?.verifyUrl;
  if (!verifyUrl) {
    throw new Error(
      'The verification email was sent but carried no `verifyUrl`. `sendVerificationEmail` must ' +
        'pass the callback `url` into the template as `verifyUrl` (e.g. ' +
        'createElement(WelcomeVerification, { firstName: user.name, verifyUrl: url })).',
    );
  }

  const token = new URL(verifyUrl).searchParams.get('token');
  if (!token) {
    throw new Error(
      `The verify url has no \`token\` query param (got ${verifyUrl}). The link Better Auth builds ` +
        'must be passed through unchanged — it is the signed JWT the verify callback checks.',
    );
  }

  // Hitting the verify callback with the token is what clicking the email link does.
  await auth.api.verifyEmail({ query: { token } });

  const [user] =
    await sql`select id, email_verified from "user" where email = ${email}`;
  return { user, token };
};

// Requirement 3 — clicking the CTA flips user.emailVerified to true, and the
// verification table stays empty (the token is a JWT in the url, not a DB row).
describe('verifying the email flips emailVerified and writes no verification row', () => {
  it('sets emailVerified to true for the user who followed the link', async () => {
    const email = freshEmail('flip');

    const [pre] = await sql`select 1 from "user" where email = ${email}`;
    expect(
      pre,
      'Setup: the user should not exist before sign-up — a stale row means a previous run did not clean up.',
    ).toBeUndefined();

    const { user } = await signUpAndVerify(email);

    expect(
      user?.email_verified,
      'After following the verification link the user row must have emailVerified = true. ' +
        'auth.api.verifyEmail (the verify callback) is what flips it; if it is still false, the ' +
        'token was not accepted or the emailVerification block is misconfigured.',
    ).toBe(true);
  });

  it('writes no row to the verification table during the whole flow', async () => {
    const email = freshEmail('norow');

    await signUpAndVerify(email);

    const rows = await sql<{ c: number }[]>`
      select count(*)::int as c from verification where identifier = ${email}`;

    expect(
      rows[0]?.c,
      'The verification table must stay empty: in this Better Auth version the email-verification ' +
        'token is a stateless signed JWT carried in the url, not a database row. A row here means ' +
        'something is persisting the token — the gate is meant to be enforced by signature + expiry alone.',
    ).toBe(0);
  });
});

// Requirement 4 — after verifying, the user is signed in (a fresh session row
// exists), because autoSignInAfterVerification issues the first session on the
// verify-callback request. No password is re-entered anywhere in this flow.
describe('verifying signs the user in by creating a session', () => {
  it('creates a session row for the user once the link is followed', async () => {
    const email = freshEmail('session');

    const { user } = await signUpAndVerify(email);

    expect(
      user?.id,
      'Setup: the verified user row must exist before checking its sessions.',
    ).toBeTruthy();

    const rows = await sql<{ c: number }[]>`
      select count(*)::int as c from session where user_id = ${user?.id as string}`;

    expect(
      rows[0]?.c,
      'Following the verification link must leave the user signed in — a session row should exist ' +
        'for them. That session is issued by `autoSignInAfterVerification: true`; without it, the ' +
        'user would land on /verify and still have to type their password again.',
    ).toBeGreaterThan(0);
  });

  it('does not create a session before the link is followed (sign-up alone leaves no session)', async () => {
    const email = freshEmail('nosession');

    // Sign up only — do NOT verify. autoSignIn is false, so no session yet.
    await auth.api.signUpEmail({
      body: { name: 'Grace Hopper', email, password: PASSWORD },
    });

    const [user] = await sql`select id from "user" where email = ${email}`;
    expect(
      user?.id,
      'Setup: sign-up should still create the user row even though it is unverified.',
    ).toBeTruthy();

    const rows = await sql<{ c: number }[]>`
      select count(*)::int as c from session where user_id = ${user?.id as string}`;

    expect(
      rows[0]?.c,
      'Sign-up alone must NOT create a session — the first session of the flow is issued on the ' +
        'verify callback, not at sign-up (emailAndPassword.autoSignIn is false). A session here ' +
        'means the user is being signed in before proving control of their email.',
    ).toBe(0);
  });
});
