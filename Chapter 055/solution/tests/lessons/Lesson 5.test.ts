import { afterAll, describe, expect, it, vi } from 'vitest';

// `@/lib/auth` (reached by the proxy through `SESSION_COOKIE_PREFIX`, and by the
// seeding helpers directly) opens with `import 'server-only'`, a marker that throws
// the instant it loads outside the React Server runtime. Vitest's node env is not
// that runtime, so we swap it for an empty module before any student code loads.
// Harness concern only — it changes no behaviour we assert on.
vi.mock('server-only', () => ({}));

// The sign-out action reads its session cookie from `next/headers`. There is no real
// request in the node runtime, so we stand in a mutable header store and hand each
// test the cookie it needs by reassigning `currentHeaders` right before the call.
let currentHeaders = new Headers();
vi.mock('next/headers', () => ({
  headers: async () => currentHeaders,
}));

// `@/lib/auth` and `@/db` validate `process.env` through `@/env` at module-load time
// and refuse to boot when a variable is missing. Vitest does not auto-load `.env`, so
// we load it first. The suite also talks to the same local Postgres the app uses (the
// `app` database) — it must be running with the auth tables migrated
// (`pnpm auth:generate` + `pnpm db:migrate`).
process.loadEnvFile(new URL('../../.env', import.meta.url));

// Public surface only: the proxy and sign-out action this lesson ships, the `auth`
// instance (to seed verified accounts and mint a real session cookie), and the
// postgres driver to read the rows that land. We read the database directly (not
// through the student's `db` client) so we assert the rows however they were wired.
const { NextRequest } = await import('next/server');
const { proxy } = await import('@/proxy');
const { signOutAction } = await import('@/app/(protected)/sign-out-action');
const { auth } = await import('@/lib/auth');
const { default: postgres } = await import('postgres');

const sql = postgres(process.env.DATABASE_URL as string);

// Fresh namespace per run so reruns never collide on the unique email index, and a
// stable prefix so afterAll can sweep every row the suite created. The user→session
// FK cascades, so deleting the user clears its sessions too.
const NS = `l5probe+${Date.now()}`;
const freshEmail = (tag: string) => `${NS}-${tag}@acme.test`;
const PASSWORD = 'correct-horse-battery-staple';

afterAll(async () => {
  await sql`delete from "user" where email like ${`${NS}-%@acme.test`}`;
  await sql.end();
});

// Drive the proxy with a synthetic request and report only what the browser would
// observe: did it redirect, and to where. A non-redirect response (pass-through) is
// reported as `redirected: false`. The dev cookie prefix is `better-auth`, so a
// present session cookie is `better-auth.session_token=<value>`.
const runProxy = async (
  path: string,
  opts: { withCookie?: boolean } = {},
): Promise<{ redirected: boolean; location: string | null }> => {
  const cookie = opts.withCookie
    ? 'better-auth.session_token=synthetic.value'
    : '';
  const request = new NextRequest(`http://localhost:3000${path}`, {
    headers: { cookie },
  });
  const response = await proxy(request);
  const raw = response?.headers?.get('location') ?? null;
  // NextResponse.redirect() builds the Location from new URL(target, request.url),
  // so the header is an ABSOLUTE url (http://localhost:3000/sign-in?next=…). We keep
  // the path + query the browser would navigate to, dropping the origin, so the
  // assertions read like the redirects the lesson talks about.
  const location = raw === null ? null : raw.replace(/^https?:\/\/[^/]+/, '');
  // NextResponse.redirect() carries a 3xx status and a Location header;
  // NextResponse.next() carries neither.
  const redirected =
    raw !== null && response?.status !== undefined && response.status >= 300;
  return { redirected, location };
};

// Sign-up writes the user + credential account; we flip emailVerified directly so the
// account can sign in without driving the email-verification flow (Lesson 3's
// concern). Returns the session cookie value Better Auth minted on sign-in.
const seedSignedInUser = async (email: string): Promise<string> => {
  await auth.api.signUpEmail({
    body: { name: 'Ada Lovelace', email, password: PASSWORD },
  });
  await sql`update "user" set email_verified = true where email = ${email}`;
  const res = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  const value = setCookie.match(/better-auth\.session_token=([^;]+)/)?.[1];
  if (!value) {
    throw new Error('seed sign-in did not mint a session cookie');
  }
  return value;
};

const sessionCount = async (email: string): Promise<number> => {
  const rows = await sql<{ c: number }[]>`
    select count(*)::int as c
    from session s join "user" u on u.id = s.user_id
    where u.email = ${email}`;
  return rows[0]?.c ?? 0;
};

// A successful Server Action ends in redirect(), which throws a Next.js
// "NEXT_REDIRECT" control-flow error rather than returning. We treat that throw as a
// redirect and read the destination off the digest. A non-redirect throw is a real
// bug — re-thrown.
const isRedirectError = (e: unknown): e is { digest: string } =>
  typeof e === 'object' &&
  e !== null &&
  'digest' in e &&
  typeof (e as { digest?: unknown }).digest === 'string' &&
  (e as { digest: string }).digest.startsWith('NEXT_REDIRECT');

// Requirement 1 — the proxy is the cheap, presence-only gate: a signed-out request to
// a protected path is bounced to /sign-in carrying the original path in a sanitized
// ?next=, so signing in returns the user exactly where they were headed. A request
// that already carries a session cookie passes straight through.
describe('a signed-out request to a protected path is sent to sign-in with ?next=', () => {
  it('redirects /dashboard to /sign-in?next=%2Fdashboard when no session cookie is present', async () => {
    const outcome = await runProxy('/dashboard');

    expect(
      outcome.redirected,
      `A signed-out /dashboard request must be redirected by the proxy, but it passed through (status without a Location header). Is proxy.ts still the NextResponse.next() stub? It should read getSessionCookie(request, { cookiePrefix: SESSION_COOKIE_PREFIX }) and redirect when the cookie is absent on a /dashboard path.`,
    ).toBe(true);

    expect(
      outcome.location,
      `A signed-out /dashboard request must land on /sign-in?next=%2Fdashboard so sign-in can return the user — got '${outcome.location}'. The target is '/sign-in?next=' + encodeURIComponent(path + search); encodeURIComponent('/dashboard') is '%2Fdashboard'.`,
    ).toContain('/sign-in?next=%2Fdashboard');
  });

  it('lets a request that carries a session cookie reach /dashboard untouched', async () => {
    const outcome = await runProxy('/dashboard', { withCookie: true });

    expect(
      outcome.redirected,
      `A /dashboard request that already carries a session cookie must pass through (NextResponse.next()), not redirect — it was sent to '${outcome.location}'. The proxy decides on cookie presence only; reading getSessionCookie with the wrong cookiePrefix is the silent failure that bounces signed-in users.`,
    ).toBe(false);
  });
});

// Requirement 2 — the inverse gate: a signed-in user has no business on the auth
// pages, so a request carrying a session cookie to /sign-in or /sign-up is bounced to
// /dashboard before the form ever renders. The same path with no cookie must render
// the form (pass through).
describe('a signed-in request to an auth page is bounced to /dashboard', () => {
  it('redirects /sign-in to /dashboard when a session cookie is present', async () => {
    const outcome = await runProxy('/sign-in', { withCookie: true });

    expect(
      outcome.redirected && outcome.location === '/dashboard',
      `A signed-in /sign-in request must be bounced to /dashboard — got ${
        outcome.redirected ? `'${outcome.location}'` : 'a pass-through'
      }. The proxy's inverse branch is: path is /sign-in or /sign-up AND a session cookie is present → redirect /dashboard.`,
    ).toBe(true);
  });

  it('redirects /sign-up to /dashboard when a session cookie is present', async () => {
    const outcome = await runProxy('/sign-up', { withCookie: true });

    expect(
      outcome.redirected && outcome.location === '/dashboard',
      `A signed-in /sign-up request must be bounced to /dashboard — got ${
        outcome.redirected ? `'${outcome.location}'` : 'a pass-through'
      }. /sign-up belongs in the same inverse-gate branch as /sign-in.`,
    ).toBe(true);
  });

  it('lets a signed-out request render /sign-in', async () => {
    const outcome = await runProxy('/sign-in');

    expect(
      outcome.redirected,
      `A signed-out /sign-in request must pass through so the form renders — it was redirected to '${outcome.location}'. The inverse gate only fires when a session cookie is present; with no cookie the auth page must be reachable.`,
    ).toBe(false);
  });
});

// Requirement 3 — sign-out is revocation: the action deletes the session row for the
// caller's token (the opaque-server-session model made real — the row's absence IS the
// revocation) and redirects to /sign-in, so a later /dashboard visit is gated again.
// We mint a real session, hand its cookie to the action via the mocked next/headers,
// then assert the one row is gone and the redirect landed.
describe('signing out deletes the session row and redirects to /sign-in', () => {
  it('removes exactly the signed-in session and redirects to /sign-in', async () => {
    const email = freshEmail('signout');
    const cookieValue = await seedSignedInUser(email);
    currentHeaders = new Headers({
      cookie: `better-auth.session_token=${cookieValue}`,
    });

    const before = await sessionCount(email);
    expect(
      before,
      `Seeding a sign-in should leave exactly one session row, but found ${before}. The suite cannot prove the deletion without a row to delete — check the seed sign-in.`,
    ).toBe(1);

    let location: string | undefined;
    let nonRedirectError: unknown;
    try {
      await signOutAction();
    } catch (e) {
      if (isRedirectError(e)) {
        location = e.digest.split(';').find((part) => part.startsWith('/'));
      } else {
        nonRedirectError = e;
      }
    }

    expect(
      nonRedirectError,
      `signOutAction threw something other than a redirect: ${String(
        nonRedirectError,
      )}. Is it still the "not implemented" stub? It should call auth.api.signOut({ headers: await headers() }) and then redirect('/sign-in').`,
    ).toBeUndefined();

    expect(
      location,
      `After clearing the session, sign-out must redirect to /sign-in — got '${location}'. The redirect('/sign-in') follows the auth.api.signOut call.`,
    ).toBe('/sign-in');

    const after = await sessionCount(email);
    expect(
      after,
      `Sign-out must delete the session row for that token — the user's session count went from ${before} to ${after}, but it should reach 0. auth.api.signOut deletes the row server-side (the revocation); a surviving row means the token is still valid and the gate would wave it through.`,
    ).toBe(0);
  });
});
