import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Lesson 6 — Accept the invitation behind the provided arrival surfaces.
//
// Covers the [tested] functional requirements of the acceptInvitation action + the
// getInvitationById read in isolation (the page render / redirect arrival surfaces,
// items 9-12, are provided code and confirmed by hand — not asserted here):
//   req 1 — clicking Accept on a valid pending invite while signed in with the matching
//           email writes a member row with the INVITED role.
//   req 2 — accepting flips the invitation to 'accepted', sets acceptedAt, and appends an
//           'invitation.accepted' audit row — all in ONE transaction (force-failing the
//           audit write leaves no member, no status flip, no audit row).
//   req 3 — a token whose sha256 does not match the stored tokenHash is refused
//           (the action re-verifies independently of the page; sig is not an input).
//   req 4 — signing in with an email other than the invited one is refused, NAMING the
//           invited address.
//   req 5 — an expired or already-accepted invitation is refused.
//   req 6 — after accepting, the active org is switched to the invited org, AFTER commit
//           (setActiveOrganization runs only once the membership is visible).
//   req 7 — a user unverified at accept time has emailVerified true afterward, with no
//           separate verification email sent.
//   req 8 — two simultaneous Accept submissions resolve to one success and one no-op
//           (the status='pending' precondition matches nothing on the second).
//
// Node env, no DOM. getInvitationById is exercised as the unscoped read the action leans
// on (it is the start stub returning null until L6 — a null row makes the action refuse,
// so the start side fails req 1/6/7 informatively). Each gate stands up its own user +
// invitation rows through the unscoped db (the runner's setup wire, NOT the path under
// test — the superuser connection bypasses RLS) and tears them down, so the suite is
// re-runnable against the dev seed (org_acme: Alice=owner, Bob=admin, Carol=member). A
// connection error in any gate means the Docker Postgres is not running or the seed has
// not been applied.

// `server-only` throws on import under Node; neutralise it so the @/ modules load.
vi.mock('server-only', () => ({}));

// redirect() and headers() run outside a request scope here. redirect throws a marker so
// the runner can tell "the action reached its post-commit redirect" from a real error;
// headers supplies the ip / user-agent the audit row derives.
const REDIRECT_MARKER = 'NEXT_REDIRECT::lesson-6';
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`${REDIRECT_MARKER}:${to}`);
  },
}));
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers({
      'x-forwarded-for': '203.0.113.7',
      'user-agent': 'lesson-6-test',
    }),
}));

// The acting identity. The action reads getCurrentUser() to decide the email-match and
// the emailVerified carve-out; this mutable slot lets each gate pick who is signed in
// without standing up Better Auth. auth.api.setActiveOrganization is the one post-commit
// auth.api write — recorded (not executed) so req 6 can assert WHICH org it switched to
// and WHEN (the membership must already be committed when it fires). Everything else on
// @/lib/auth (getInvitationById's siblings, env-driven helpers) stays real.
type ActingUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
} | null;
const ACTING: { user: ActingUser } = { user: null };
let setActiveCall: {
  organizationId?: string;
  memberExistedAtCall?: boolean;
} | null = null;
let verificationEmailsSent = 0;
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getCurrentUser: async () => ACTING.user,
    auth: {
      api: {
        setActiveOrganization: async ({
          body,
        }: {
          headers?: unknown;
          body?: { organizationId?: string };
        }) => {
          // Record the org and, crucially, whether the seat already exists in the DB at
          // the moment of the call — proving the switch runs AFTER the tx commits.
          const exists = await memberExists(
            ACTING.user?.id ?? '__none__',
            body?.organizationId ?? '__none__',
          );
          setActiveCall = {
            organizationId: body?.organizationId,
            memberExistedAtCall: exists,
          };
          return { id: 'session_test' };
        },
      },
    },
  };
});

// sendEmail is the verification-email side effect Better Auth would fire on an unverified
// user. The action must NOT trigger a separate verify email (it flips emailVerified
// in-tx instead) — this counter proves req 7's "no separate verification email sent".
vi.mock('@/lib/email', () => ({
  sendEmail: async () => {
    verificationEmailsSent += 1;
    return { ok: true, data: { id: 'email_test_id' } };
  },
}));

// The audit table the action inserts directly through `tx`. When auditShouldFail is set,
// swap it for a twin table pointed at a non-existent relation, so the INSERT throws a DB
// error INSIDE the withTenant tx — the lever req 2 uses to prove the seat-grant rolls
// back with its audit row. Off the flag, the real table is returned untouched.
let auditShouldFail = false;
vi.mock('@/db/audit', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const { pgTable, text, jsonb, timestamp, uuid } = await import(
    'drizzle-orm/pg-core'
  );
  const poisoned = pgTable('audit_logs_does_not_exist', {
    id: uuid().primaryKey(),
    organizationId: text(),
    actorUserId: text(),
    actorIp: text(),
    actorUserAgent: text(),
    action: text(),
    subjectType: text(),
    subjectId: text(),
    payload: jsonb(),
    createdAt: timestamp({ withTimezone: true }),
  });
  return new Proxy(actual, {
    get(target, prop) {
      if (prop === 'auditLogs' && auditShouldFail) return poisoned;
      return target[prop as string];
    },
  });
});

// The env boundary (@/env) validates process.env at import time; vitest does not
// auto-load .env, so seed the values the @/db import graph needs. `||=` leaves any real
// environment untouched, so the live-DB gates reach the student's DATABASE_URL.
beforeAll(() => {
  process.env.DATABASE_URL ||=
    'postgres://postgres:postgres@localhost:5432/app';
  process.env.DATABASE_URL_UNPOOLED ||=
    'postgres://postgres:postgres@localhost:5432/app';
  process.env.SEED ||= '1';
  process.env.BETTER_AUTH_SECRET ||=
    'dev-only-better-auth-secret-please-rotate-32b';
  process.env.BETTER_AUTH_URL ||= 'http://localhost:3000';
  process.env.RESEND_API_KEY ||= 're_xxx';
  process.env.EMAIL_FROM ||= 'Acme <verify@send.acme.example>';
  process.env.EMAIL_REPLY_TO ||= 'support@acme.example';
  process.env.NEXT_PUBLIC_APP_NAME ||= 'Acme';
  process.env.NEXT_PUBLIC_APP_URL ||= 'http://localhost:3000';
  process.env.INVITATION_SIGNING_SECRET ||=
    'dev-only-invitation-signing-secret-rotate=';
});

afterEach(() => {
  ACTING.user = null;
  auditShouldFail = false;
  setActiveCall = null;
  verificationEmailsSent = 0;
});

const ORG_ACME = 'org_acme';

// A FormData built from a plain object — the shape Object.fromEntries(formData) reads.
const form = (fields: Record<string, string>): FormData => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

// A Result discriminant, loosely typed for the fields the runner reads.
type ResultLike = {
  ok: boolean;
  data?: { ok?: boolean };
  error?: { code?: string; userMessage?: string };
};

// The unscoped db, reserved for the runner's own fixture setup/inspection (never the
// path the app code under test takes). Typed for the raw queries the gates run.
type DbLike = {
  execute: (
    s: unknown,
  ) => Promise<Array<Record<string, string | number | boolean | null>>>;
};
const loadDb = async (): Promise<DbLike> =>
  ((await import('@/db')) as unknown as { db: DbLike }).db;

// The student's acceptInvitation action.
const loadAcceptInvitation = async () => {
  const mod = (await import('@/lib/invitations/accept')) as unknown as {
    acceptInvitation: (
      prev: ResultLike | null,
      formData: FormData,
    ) => Promise<ResultLike>;
  };
  return mod.acceptInvitation;
};

// A bare Web Crypto SHA-256 hex digest, used by the fixtures to compute a tokenHash the
// action's own sha256 will match. Inlined (not the student's @/lib/invitations/url.sha256)
// so the fixture wiring never depends on a prior lesson's helper — the only thing under
// test here is acceptInvitation re-hashing the raw token and comparing.
const sha256Hex = async (raw: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new Uint8Array(new TextEncoder().encode(raw)),
  );
  return Buffer.from(new Uint8Array(digest)).toString('hex');
};

// --- fixture wiring (superuser db, bypasses RLS) ---------------------------------

const memberExists = async (
  userId: string,
  orgId: string,
): Promise<boolean> => {
  const db = await loadDb();
  const { sql } = await import('drizzle-orm');
  const rows = (await db.execute(
    sql`select count(*)::text as n from member
        where user_id = ${userId} and organization_id = ${orgId}`,
  )) as Array<{ n: string }>;
  return Number(rows[0]?.n ?? '0') > 0;
};

// Insert a fresh user (default unverified) and clean any prior twin by id/email.
const seedUser = async (
  id: string,
  email: string,
  emailVerified: boolean,
): Promise<ActingUser> => {
  const db = await loadDb();
  const { sql } = await import('drizzle-orm');
  await db.execute(sql`delete from member where user_id = ${id}`);
  await db.execute(sql`delete from "user" where id = ${id}`);
  await db.execute(
    sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
        values (${id}, ${'Newcomer'}, ${email}, ${emailVerified}, now(), now())`,
  );
  return { id, email, name: 'Newcomer', emailVerified };
};

// Insert a pending (or otherwise-stated) invitation for the given org/email/role with a
// tokenHash matching `rawToken`. Returns the invitation id.
const seedInvite = async (opts: {
  id: string;
  email: string;
  role: string;
  rawToken: string;
  status?: string;
  expiresAt?: Date;
  acceptedAt?: Date | null;
}): Promise<string> => {
  const db = await loadDb();
  const { sql } = await import('drizzle-orm');
  const tokenHash = await sha256Hex(opts.rawToken);
  await db.execute(sql`delete from invitation where id = ${opts.id}`);
  await db.execute(
    sql`insert into invitation
          (id, organization_id, email, role, status, expires_at, created_at,
           inviter_id, token_hash, accepted_at)
        values
          (${opts.id}, ${ORG_ACME}, ${opts.email}, ${opts.role},
           ${opts.status ?? 'pending'},
           ${(opts.expiresAt ?? new Date('2099-12-31T00:00:00.000Z')).toISOString()},
           now(), ${'user_bob'}, ${tokenHash},
           ${opts.acceptedAt ? opts.acceptedAt.toISOString() : null})`,
  );
  return opts.id;
};

const cleanup = async (userId: string, inviteId: string): Promise<void> => {
  const db = await loadDb();
  const { sql } = await import('drizzle-orm');
  await db.execute(sql`delete from audit_logs where subject_id = ${inviteId}`);
  await db.execute(sql`delete from member where user_id = ${userId}`);
  await db.execute(sql`delete from invitation where id = ${inviteId}`);
  await db.execute(sql`delete from "user" where id = ${userId}`);
};

const inviteRow = async (
  inviteId: string,
): Promise<{ status?: string; acceptedAtNull?: boolean } | null> => {
  const db = await loadDb();
  const { sql } = await import('drizzle-orm');
  const rows = (await db.execute(
    sql`select status, (accepted_at is null) as accepted_at_null
        from invitation where id = ${inviteId}`,
  )) as Array<{ status: string; accepted_at_null: boolean }>;
  const r = rows[0];
  return r ? { status: r.status, acceptedAtNull: r.accepted_at_null } : null;
};

const memberRole = async (
  userId: string,
  orgId: string,
): Promise<string | null> => {
  const db = await loadDb();
  const { sql } = await import('drizzle-orm');
  const rows = (await db.execute(
    sql`select role from member where user_id = ${userId} and organization_id = ${orgId}`,
  )) as Array<{ role: string }>;
  return rows[0]?.role ?? null;
};

const acceptedAuditCount = async (inviteId: string): Promise<number> => {
  const db = await loadDb();
  const { sql } = await import('drizzle-orm');
  const rows = (await db.execute(
    sql`select count(*)::text as n from audit_logs
        where action = 'invitation.accepted' and subject_id = ${inviteId}`,
  )) as Array<{ n: string }>;
  return Number(rows[0]?.n ?? '-1');
};

const userVerified = async (userId: string): Promise<boolean> => {
  const db = await loadDb();
  const { sql } = await import('drizzle-orm');
  const rows = (await db.execute(
    sql`select email_verified from "user" where id = ${userId}`,
  )) as Array<{ email_verified: boolean }>;
  return rows[0]?.email_verified === true;
};

// Run the action, absorbing the post-commit redirect() throw (success path) so the gate
// can inspect the committed rows. Returns the Result on a refusal, or `redirected: true`
// when the action ran to its redirect.
const runAccept = async (
  fields: Record<string, string>,
): Promise<{ result?: ResultLike; redirected: boolean }> => {
  const acceptInvitation = await loadAcceptInvitation();
  try {
    const result = await acceptInvitation(null, form(fields));
    return { result, redirected: false };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith(REDIRECT_MARKER)) {
      return { redirected: true };
    }
    throw e;
  }
};

describe('req 1 + req 2 — a valid accept grants the seat, flips the invite, and audits, all in one tx', () => {
  const USER = 'user_l6_req1';
  const EMAIL = 'l6-req1@external.test';
  const INVITE = 'invitation_l6_req1';
  const TOKEN = 'l6-req1-raw-token';

  afterEach(async () => {
    await cleanup(USER, INVITE);
  });

  it('writes a member with the INVITED role, flips status+acceptedAt, and appends one audit row', async () => {
    ACTING.user = await seedUser(USER, EMAIL, true);
    await seedInvite({
      id: INVITE,
      email: EMAIL,
      role: 'admin',
      rawToken: TOKEN,
    });

    const { redirected } = await runAccept({ id: INVITE, token: TOKEN });

    expect(
      redirected,
      'A valid pending accept (matching signed-in email, matching token) must run to its post-commit redirect to /dashboard. It refused or threw instead — check the re-verify guards and that getInvitationById returns the full row (it is a TODO stub returning null until this lesson).',
    ).toBe(true);

    expect(
      await memberRole(USER, ORG_ACME),
      'Accepting must insert a member row for the signed-in user in the invited org, carrying the INVITED role (admin here) — not a hard-coded "member" default.',
    ).toBe('admin');

    const inv = await inviteRow(INVITE);
    expect(
      inv?.status,
      "Accepting must flip the invitation to status='accepted' so it can never be redeemed twice.",
    ).toBe('accepted');
    expect(
      inv?.acceptedAtNull,
      'Accepting must stamp acceptedAt with the accept time (it is still null).',
    ).toBe(false);

    expect(
      await acceptedAuditCount(INVITE),
      "Accepting must append exactly one 'invitation.accepted' audit row (subject_id = the invitation id), written directly through tx — not via logAudit, which derives org from a membership the invitee does not yet have.",
    ).toBe(1);
  });

  it('rolls the seat-grant AND its audit row back when the in-tx audit write fails', async () => {
    ACTING.user = await seedUser(USER, EMAIL, true);
    await seedInvite({
      id: INVITE,
      email: EMAIL,
      role: 'member',
      rawToken: TOKEN,
    });

    // Force the audit INSERT (the last write in the tx) to hit a non-existent relation.
    auditShouldFail = true;
    let threw = false;
    let outcome: { result?: ResultLike; redirected: boolean } | undefined;
    try {
      outcome = await runAccept({ id: INVITE, token: TOKEN });
    } catch {
      threw = true;
    }
    auditShouldFail = false;

    expect(
      threw || outcome?.redirected === false,
      'When a write inside the accept transaction fails, the action must not run on to its success redirect — the transaction aborts.',
    ).toBe(true);

    expect(
      await memberRole(USER, ORG_ACME),
      'The member insert, the status flip, the emailVerified flip, and the audit row are ONE withTenant transaction: if the audit write fails, the seat-grant must roll back too. A member row survived, so the writes are not co-transacted.',
    ).toBeNull();
    expect(
      (await inviteRow(INVITE))?.status,
      'A failed audit write must roll back the status flip as well — the invitation must stay pending.',
    ).toBe('pending');
    expect(
      await acceptedAuditCount(INVITE),
      'No audit row may survive a rolled-back accept.',
    ).toBe(0);
  });
});

describe('req 3 — a token whose sha256 does not match the stored tokenHash is refused', () => {
  const USER = 'user_l6_req3';
  const EMAIL = 'l6-req3@external.test';
  const INVITE = 'invitation_l6_req3';

  afterEach(async () => {
    await cleanup(USER, INVITE);
  });

  it('re-hashes the token independently of the page and refuses a wrong token, writing nothing', async () => {
    ACTING.user = await seedUser(USER, EMAIL, true);
    await seedInvite({
      id: INVITE,
      email: EMAIL,
      role: 'member',
      rawToken: 'the-real-raw-token',
    });

    const { result, redirected } = await runAccept({
      id: INVITE,
      token: 'a-forged-token-that-does-not-match',
    });

    expect(
      redirected,
      'A token whose sha256 does not equal the stored tokenHash must be refused — the action re-verifies the hash itself (the page POST is a separate request). It accepted instead.',
    ).toBe(false);
    expect(
      result?.ok,
      'A hash mismatch must return ok: false, not throw.',
    ).toBe(false);
    expect(
      result?.error?.code,
      "A hash mismatch collapses into the generic invalid refusal err('not_found').",
    ).toBe('not_found');
    expect(
      await memberExists(USER, ORG_ACME),
      'A refused accept must write no member row.',
    ).toBe(false);
  });
});

describe('req 4 — accepting while signed in with a different email is refused, naming the invited address', () => {
  const USER = 'user_l6_req4';
  const SIGNED_IN_EMAIL = 'someone-else@external.test';
  const INVITED_EMAIL = 'the-invited-one@external.test';
  const INVITE = 'invitation_l6_req4';
  const TOKEN = 'l6-req4-raw-token';

  afterEach(async () => {
    await cleanup(USER, INVITE);
  });

  it('refuses with forbidden and surfaces the invited email so the user knows whom to sign in as', async () => {
    ACTING.user = await seedUser(USER, SIGNED_IN_EMAIL, true);
    await seedInvite({
      id: INVITE,
      email: INVITED_EMAIL,
      role: 'member',
      rawToken: TOKEN,
    });

    const { result, redirected } = await runAccept({
      id: INVITE,
      token: TOKEN,
    });

    expect(
      redirected,
      'An invite may only be accepted by the address it was sent to. A signed-in user with a different email must be refused, not granted the seat.',
    ).toBe(false);
    expect(
      result?.error?.code,
      "An email mismatch must return err('forbidden').",
    ).toBe('forbidden');
    expect(
      result?.error?.userMessage?.includes(INVITED_EMAIL),
      'The mismatch message must name the INVITED address so the user knows which account to sign in with. The invited email is missing from the message.',
    ).toBe(true);
    expect(
      await memberExists(USER, ORG_ACME),
      'A mismatched accept must write no member row.',
    ).toBe(false);
  });
});

describe('req 5 — an expired or already-accepted invitation is refused', () => {
  const USER = 'user_l6_req5';
  const EMAIL = 'l6-req5@external.test';
  const INVITE = 'invitation_l6_req5';
  const TOKEN = 'l6-req5-raw-token';

  afterEach(async () => {
    await cleanup(USER, INVITE);
  });

  it('refuses an expired invitation', async () => {
    ACTING.user = await seedUser(USER, EMAIL, true);
    await seedInvite({
      id: INVITE,
      email: EMAIL,
      role: 'member',
      rawToken: TOKEN,
      expiresAt: new Date('2000-01-01T00:00:00.000Z'),
    });

    const { result, redirected } = await runAccept({
      id: INVITE,
      token: TOKEN,
    });

    expect(
      redirected,
      'An invitation whose expiresAt is in the past must be refused — the action re-checks expiry itself.',
    ).toBe(false);
    expect(
      result?.error?.code,
      "An expired invite collapses into the generic invalid refusal err('not_found').",
    ).toBe('not_found');
    expect(
      await memberExists(USER, ORG_ACME),
      'An expired accept must write no member row.',
    ).toBe(false);
  });

  it('refuses an already-accepted invitation', async () => {
    ACTING.user = await seedUser(USER, EMAIL, true);
    await seedInvite({
      id: INVITE,
      email: EMAIL,
      role: 'member',
      rawToken: TOKEN,
      status: 'accepted',
      acceptedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const { result, redirected } = await runAccept({
      id: INVITE,
      token: TOKEN,
    });

    expect(
      redirected,
      "An invitation whose status is not 'pending' must be refused — the action re-checks status itself.",
    ).toBe(false);
    expect(
      result?.error?.code,
      "An already-accepted invite collapses into the generic invalid refusal err('not_found').",
    ).toBe('not_found');
    expect(
      await memberExists(USER, ORG_ACME),
      'Re-accepting an already-accepted invite must write no second member row.',
    ).toBe(false);
  });
});

describe('req 6 — the active org is switched to the invited org, AFTER the seat is committed', () => {
  const USER = 'user_l6_req6';
  const EMAIL = 'l6-req6@external.test';
  const INVITE = 'invitation_l6_req6';
  const TOKEN = 'l6-req6-raw-token';

  afterEach(async () => {
    await cleanup(USER, INVITE);
  });

  it('calls setActiveOrganization with the invited org, with the membership already committed', async () => {
    ACTING.user = await seedUser(USER, EMAIL, true);
    await seedInvite({
      id: INVITE,
      email: EMAIL,
      role: 'member',
      rawToken: TOKEN,
    });

    const { redirected } = await runAccept({ id: INVITE, token: TOKEN });
    expect(
      redirected,
      'A valid accept must run to its post-commit redirect — the positive control for the active-org switch.',
    ).toBe(true);

    expect(
      setActiveCall?.organizationId,
      'After accepting, the action must switch the active org to the INVITED org via setActiveOrganization, so the user lands in the org they just joined.',
    ).toBe(ORG_ACME);
    expect(
      setActiveCall?.memberExistedAtCall,
      'setActiveOrganization must run AFTER the withTenant tx commits — the plugin refuses to activate an org the caller is not yet a member of. At the moment it was called, the member row did not yet exist, so the switch was wired inside/before the transaction.',
    ).toBe(true);
  });
});

describe('req 7 — an unverified accepter ends up verified, with no separate verify email', () => {
  const USER = 'user_l6_req7';
  const EMAIL = 'l6-req7@external.test';
  const INVITE = 'invitation_l6_req7';
  const TOKEN = 'l6-req7-raw-token';

  afterEach(async () => {
    await cleanup(USER, INVITE);
  });

  it('flips emailVerified to true in-tx and sends no verification email', async () => {
    // Signed in but unverified — the invite click on this very address is the proof.
    ACTING.user = await seedUser(USER, EMAIL, false);
    await seedInvite({
      id: INVITE,
      email: EMAIL,
      role: 'member',
      rawToken: TOKEN,
    });

    const { redirected } = await runAccept({ id: INVITE, token: TOKEN });
    expect(
      redirected,
      'An unverified user accepting their own invite must still succeed (run to the redirect) — receiving the click on the invited address IS the email-ownership proof.',
    ).toBe(true);

    expect(
      await userVerified(USER),
      'Accepting must flip emailVerified to true for a previously-unverified accepter — sparing them a verify-your-email loop right after joining.',
    ).toBe(true);
    expect(
      verificationEmailsSent,
      'No separate verification email may be sent — the accept itself verifies the address. A verification email went out instead.',
    ).toBe(0);
  });
});

describe('req 8 — two simultaneous accepts resolve to one success and one no-op', () => {
  const USER = 'user_l6_req8';
  const EMAIL = 'l6-req8@external.test';
  const INVITE = 'invitation_l6_req8';
  const TOKEN = 'l6-req8-raw-token';

  afterEach(async () => {
    await cleanup(USER, INVITE);
  });

  it("the status='pending' precondition lets the first accept win and the second flip nothing", async () => {
    ACTING.user = await seedUser(USER, EMAIL, true);
    await seedInvite({
      id: INVITE,
      email: EMAIL,
      role: 'member',
      rawToken: TOKEN,
    });

    // First accept commits and redirects.
    const first = await runAccept({ id: INVITE, token: TOKEN });
    expect(
      first.redirected,
      'The first accept must succeed (run to its redirect) so there is an accepted invite for the second to race against.',
    ).toBe(true);

    // Second accept: the row is now status='accepted', so the re-verify guard (status
    // must be 'pending') refuses it. The status='pending' filter on the UPDATE is the
    // optimistic-concurrency guard that makes a genuine double-submit a no-op.
    const second = await runAccept({ id: INVITE, token: TOKEN });
    expect(
      second.redirected,
      'A second accept of an already-accepted invite must NOT succeed again — the re-verify status guard (and the status=pending UPDATE precondition) make it a no-op, not a second seat-grant.',
    ).toBe(false);
    expect(
      second.result?.error?.code,
      "The losing accept collapses into the generic invalid refusal err('not_found').",
    ).toBe('not_found');

    const members = await (async () => {
      const db = await loadDb();
      const { sql } = await import('drizzle-orm');
      const rows = (await db.execute(
        sql`select count(*)::text as n from member
            where user_id = ${USER} and organization_id = ${ORG_ACME}`,
      )) as Array<{ n: string }>;
      return Number(rows[0]?.n ?? '-1');
    })();
    expect(
      members,
      'Two accepts must yield exactly ONE membership — the second is a no-op, never a duplicate seat.',
    ).toBe(1);
  });
});
