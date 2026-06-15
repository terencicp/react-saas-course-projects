import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Lesson 5 — Send an invitation with a signed accept URL.
//
// Covers the [tested] functional requirements:
//   req 1 — submitting the invite form as an admin creates an invitation row with
//           status='pending' and the chosen role, surfaced by listPendingInvitations.
//   req 2 — tokenHash holds a 64-char hex string and the raw token (the one in the
//           emailed accept URL) appears in no column of the invitation row.
//   req 3 — a successful send appends an 'invitation.sent' audit row in the SAME
//           transaction as the invitation insert (force-failing the audit lands neither).
//   req 4 — a second invite to the same pending email returns conflict (the 23505
//           partial-index catch), never a throw.
//   req 5 — inviting an email that already belongs to a member returns conflict, with a
//           distinct message fired by the membership pre-check (not the index).
//   req 6 — when Resend rejects the send, the action returns ok({ invitationId,
//           emailSent: false }) and the invitation row still exists.
//
// Requirements 7-8 (the live React Email in a real inbox, opening the emailed URL) need
// a verified domain + live inbox, so they stay [untested] and are confirmed by hand.
//
// Node env, no DOM. The url-helper gates anchor on the student's own exported code
// (generateInviteToken / sha256 / signedInviteUrl) as positive controls, so an
// unimplemented start fails informatively before any DB row is touched. The send-path
// gates run against the dev seed (org_acme: Alice=owner, Bob=admin, Carol=member) and
// delete every row they create so the suite is re-runnable. A connection error in any
// live-DB gate means the Docker Postgres is not running or the seed has not been applied.

// `server-only` throws on import under Node; neutralise it so the @/ modules load.
vi.mock('server-only', () => ({}));

// revalidatePath('/inspector') runs outside a request scope here; make it a no-op.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

// authedAction + logAudit read `await headers()`, which throws off-request. A bare
// Headers object supplies the ip / user-agent they derive.
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers({
      'x-forwarded-for': '203.0.113.7',
      'user-agent': 'lesson-5-test',
    }),
}));

// The acting identity. authedAction and logAudit both derive actor/org from
// requireOrgUser; this mutable slot lets each test pick who is acting without standing
// up Better Auth. Default: Bob, the seeded Acme admin. INVITATION_TTL_SECONDS is the
// real constant the action reads for expiresAt.
const ACTING = {
  user: { id: 'user_bob', email: 'bob@acme.test', name: 'Bob' },
  orgId: 'org_acme',
  role: 'admin' as 'owner' | 'admin' | 'member',
};
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    requireOrgUser: async () => ({
      user: ACTING.user,
      orgId: ACTING.orgId,
      role: ACTING.role,
    }),
  };
});

// logAudit is the audit writer sendInvitation co-transacts. req 3 force-fails it to
// prove the invitation insert rolls back with it; every other gate keeps the real one.
let auditShouldFail = false;
vi.mock('@/db/audit-log', async (importOriginal) => {
  const actual = (await importOriginal()) as {
    logAudit: (...args: unknown[]) => Promise<void>;
  };
  return {
    logAudit: async (...args: unknown[]) => {
      if (auditShouldFail) {
        throw new Error('forced audit failure (req 3)');
      }
      return actual.logAudit(...args);
    },
  };
});

// sendEmail is the post-commit side effect. The default mock records the accept URL
// the action built (so req 2 can read the raw token out of it) and reports success;
// req 6 flips it to a Resend-style failure Result. Mocking it keeps the suite from
// hitting Resend, and proves the action treats a send failure as a flag on the success
// shape rather than an error branch.
type EmailInput = { react?: { props?: { acceptUrl?: string } } };
let lastAcceptUrl: string | undefined;
let emailShouldFail = false;
vi.mock('@/lib/email', () => ({
  sendEmail: async (input: EmailInput) => {
    lastAcceptUrl = input.react?.props?.acceptUrl;
    if (emailShouldFail) {
      return {
        ok: false,
        error: { code: 'internal', userMessage: 'Email send failed.' },
      };
    }
    return { ok: true, data: { id: 'email_test_id' } };
  },
}));

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
  ACTING.user = { id: 'user_bob', email: 'bob@acme.test', name: 'Bob' };
  ACTING.orgId = 'org_acme';
  ACTING.role = 'admin';
  auditShouldFail = false;
  emailShouldFail = false;
  lastAcceptUrl = undefined;
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
  data?: { invitationId?: string; emailSent?: boolean };
  error?: { code?: string; userMessage?: string };
};

// The unscoped db, reserved for the runner's own setup/restore (never the path the app
// code under test takes). Typed for the raw queries the restore points run.
type DbLike = {
  execute: (
    s: unknown,
  ) => Promise<Array<Record<string, string | number | null>>>;
};
const loadDb = async (): Promise<DbLike> =>
  ((await import('@/db')) as unknown as { db: DbLike }).db;

// The student's sendInvitation action.
const loadSendInvitation = async () => {
  const mod = (await import('@/lib/invitations/send')) as unknown as {
    sendInvitation: (
      prev: ResultLike | null,
      formData: FormData,
    ) => Promise<ResultLike>;
  };
  return mod.sendInvitation;
};

// generateInviteToken / sha256 / signedInviteUrl — resolved through an unknown-cast
// because generateInviteToken does not exist on the start stub (the module exports only
// signedInviteUrl / verifyInviteSignature / sha256 until the student adds it), so a
// static import would not typecheck against the start side.
type UrlHelpers = {
  generateInviteToken: () => string;
  sha256: (raw: string) => Promise<string>;
  signedInviteUrl: (invitationId: string, rawToken: string) => Promise<string>;
};
const loadUrlHelpers = async (): Promise<UrlHelpers> =>
  (await import('@/lib/invitations/url')) as unknown as UrlHelpers;

// Pending-invites query for the panel surface.
const loadListPending = async () => {
  const mod = (await import('@/db/queries/invitations')) as unknown as {
    listPendingInvitations: (
      orgId: string,
    ) => Promise<Array<{ id: string; email: string; role: string | null }>>;
  };
  return mod.listPendingInvitations;
};

// Delete an invitation row straight from the wire (bypassing RLS via the superuser
// connection) so each gate leaves the seed as it found it.
const deleteInviteByEmail = async (email: string): Promise<void> => {
  const db = await loadDb();
  const { sql } = await import('drizzle-orm');
  const rows = (await db.execute(
    sql`select id::text as id from invitation where email = ${email}`,
  )) as Array<{ id: string }>;
  for (const r of rows) {
    await db.execute(sql`delete from audit_logs where subject_id = ${r.id}`);
  }
  await db.execute(sql`delete from invitation where email = ${email}`);
};

// Read the full invitation row for an email, as raw text, bypassing the facade.
const inviteRowByEmail = async (
  email: string,
): Promise<{
  id?: string;
  status?: string;
  role?: string;
  tokenHash?: string;
  rowText?: string;
} | null> => {
  const db = await loadDb();
  const { sql } = await import('drizzle-orm');
  const rows = (await db.execute(
    sql`select id::text as id, status, role, token_hash as token_hash,
               (to_jsonb(invitation))::text as row_text
        from invitation where email = ${email}`,
  )) as Array<{
    id: string;
    status: string;
    role: string;
    token_hash: string;
    row_text: string;
  }>;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    role: row.role,
    tokenHash: row.token_hash,
    rowText: row.row_text,
  };
};

// Count the 'invitation.sent' audit rows for a given subject id, bypassing RLS.
const sentAuditCount = async (subjectId: string): Promise<number> => {
  const db = await loadDb();
  const { sql } = await import('drizzle-orm');
  const rows = (await db.execute(
    sql`select count(*)::text as n from audit_logs
        where action = 'invitation.sent' and subject_id = ${subjectId}`,
  )) as Array<{ n: string }>;
  return Number(rows[0]?.n ?? '-1');
};

describe('req 2 (helpers) — the token is unguessable and stored only as a hash', () => {
  // Positive controls on the student's own crypto helpers. These run before any DB row
  // exists, so the start stubs (which throw) fail here first and informatively.
  it('generateInviteToken yields a fresh 32-byte base64url token each call', async () => {
    const { generateInviteToken } = await loadUrlHelpers();

    const a = generateInviteToken();
    const b = generateInviteToken();

    expect(
      typeof a === 'string' && /^[A-Za-z0-9_-]+$/.test(a),
      'generateInviteToken must return a base64url string (the URL-safe alphabet A-Z a-z 0-9 _ -, no padding). It throws or returns the wrong shape — implement the 32-byte crypto.getRandomValues → base64url helper.',
    ).toBe(true);
    expect(
      Buffer.from(a, 'base64url').length,
      'generateInviteToken must draw 32 random bytes — the entropy that makes the capability URL unguessable.',
    ).toBe(32);
    expect(
      a,
      'Two calls to generateInviteToken returned the same token — it must draw fresh randomness every time, not a constant.',
    ).not.toBe(b);
  });

  it('sha256 returns a 64-char lowercase hex digest', async () => {
    const { sha256 } = await loadUrlHelpers();

    const digest = await sha256('hello');

    expect(
      digest,
      'sha256(raw) must return a hex SHA-256 digest (64 lowercase hex chars). This is the only form of the token that may touch the DB.',
    ).toMatch(/^[0-9a-f]{64}$/);
    expect(
      digest,
      'sha256 must be a real SHA-256: sha256("hello") has a known digest. A different value means the digest or the hex encoding is wrong.',
    ).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});

describe('req 1 — an admin send creates a pending row with the chosen role, shown in the panel', () => {
  const EMAIL = 'req1-newhire@external.test';
  afterEach(async () => {
    await deleteInviteByEmail(EMAIL);
  });

  it('persists status=pending + the chosen role and surfaces it via listPendingInvitations', async () => {
    const sendInvitation = await loadSendInvitation();
    const listPendingInvitations = await loadListPending();

    const result = (await sendInvitation(
      null,
      form({ email: EMAIL, role: 'admin' }),
    )) as ResultLike;

    expect(
      result.ok,
      'As Bob (admin), inviting a brand-new email must succeed (ok: true) and carry an invitationId. A connection error means Postgres is not running or the seed is missing.',
    ).toBe(true);
    expect(
      typeof result.data?.invitationId,
      'A successful send must return ok({ invitationId, emailSent }) — the id of the row just written.',
    ).toBe('string');

    const row = await inviteRowByEmail(EMAIL);
    expect(
      row?.status,
      "The invitation row must be written with status='pending'.",
    ).toBe('pending');
    expect(
      row?.role,
      'The invitation row must carry the role chosen in the form (admin here), not a hard-coded default.',
    ).toBe('admin');

    const pending = await listPendingInvitations(ORG_ACME);
    const mine = pending.find((p) => p.email === EMAIL);
    expect(
      mine,
      'The new pending invite must appear in listPendingInvitations(org_acme) — the data the pending panel renders. A missing row means the query is not reading pending invites through the tenant facade.',
    ).toBeDefined();
    expect(
      mine?.role,
      'The pending panel row must reflect the chosen role.',
    ).toBe('admin');
  });
});

describe('req 2 — tokenHash is 64-char hex and the raw token lives in no column', () => {
  const EMAIL = 'req2-capability@external.test';
  afterEach(async () => {
    await deleteInviteByEmail(EMAIL);
  });

  it('stores sha256(token) as 64-char hex and never the raw token from the accept URL', async () => {
    const sendInvitation = await loadSendInvitation();

    const result = (await sendInvitation(
      null,
      form({ email: EMAIL, role: 'member' }),
    )) as ResultLike;
    expect(
      result.ok,
      'The send must succeed so there is a row to inspect (ok: true).',
    ).toBe(true);

    const row = await inviteRowByEmail(EMAIL);
    expect(
      row?.tokenHash,
      'tokenHash must be a 64-char lowercase hex SHA-256 digest. A different shape means the raw token (or nothing) is being stored instead of its hash.',
    ).toMatch(/^[0-9a-f]{64}$/);

    // The accept URL the action built (captured by the email mock) carries the RAW
    // token in its ?token= param. That raw token must appear in NO column of the row.
    expect(
      typeof lastAcceptUrl,
      'sendInvitation must build a signed accept URL and pass it to sendEmail (its acceptUrl prop). No URL was captured, so the send-after-commit email step did not run.',
    ).toBe('string');
    const rawToken = new URL(lastAcceptUrl ?? '').searchParams.get('token');
    expect(
      typeof rawToken === 'string' && rawToken.length > 0,
      'The accept URL must include the raw token as ?token=… — the capability the invitee presents back.',
    ).toBe(true);
    expect(
      row?.rowText?.includes(rawToken ?? '__never__'),
      'The raw token must appear in NO column of the invitation row — only sha256(token) is stored, so a DB read alone cannot forge a link. The raw token was found in the row.',
    ).toBe(false);
    expect(
      row?.tokenHash,
      'tokenHash must be the SHA-256 of the raw token in the accept URL — store the hash, send the token.',
    ).toBe(await (await loadUrlHelpers()).sha256(rawToken ?? ''));
  });
});

describe('req 3 — the invitation insert and its audit row co-transact', () => {
  const EMAIL = 'req3-cotransact@external.test';
  afterEach(async () => {
    await deleteInviteByEmail(EMAIL);
  });

  it('writes both on success, and neither when the audit write fails', async () => {
    const sendInvitation = await loadSendInvitation();

    // Positive control: with the real audit writer the send commits BOTH rows. A path
    // that never writes the audit row would fail here, not silently pass the rollback.
    auditShouldFail = false;
    const okResult = (await sendInvitation(
      null,
      form({ email: EMAIL, role: 'member' }),
    )) as ResultLike;
    expect(
      okResult.ok,
      'With a working audit writer the send must commit (ok: true) — the positive control for the rollback case.',
    ).toBe(true);
    const committedId = okResult.data?.invitationId ?? '';
    expect(
      await sentAuditCount(committedId),
      "A successful send must append exactly one 'invitation.sent' audit row, subject_id = the new invitation id.",
    ).toBe(1);

    // Clear the committed row so the rollback case starts from a clean slate.
    await deleteInviteByEmail(EMAIL);

    // Now force the audit insert (inside the withTenant transaction) to fail.
    auditShouldFail = true;
    let threw = false;
    let settled: ResultLike | undefined;
    try {
      settled = (await sendInvitation(
        null,
        form({ email: EMAIL, role: 'member' }),
      )) as ResultLike;
    } catch {
      threw = true;
    }
    auditShouldFail = false;

    expect(
      threw || settled?.ok === false,
      'When the audit write fails the action must not report success — the transaction aborts.',
    ).toBe(true);
    expect(
      await inviteRowByEmail(EMAIL),
      "The invitation insert and its 'invitation.sent' audit row are one transaction: if the audit write fails, the invitation row must roll back too. A row remains, so the two are not co-transacted.",
    ).toBeNull();
  });
});

describe('req 4 — a second invite to the same pending email returns conflict', () => {
  const EMAIL = 'req4-duplicate@external.test';
  afterEach(async () => {
    await deleteInviteByEmail(EMAIL);
  });

  it('catches the 23505 partial-index violation as conflict, never a throw', async () => {
    const sendInvitation = await loadSendInvitation();

    const first = (await sendInvitation(
      null,
      form({ email: EMAIL, role: 'member' }),
    )) as ResultLike;
    expect(
      first.ok,
      'The first invite to a fresh email must succeed (ok: true) so there is a pending row to collide with.',
    ).toBe(true);

    let threw = '';
    let second: ResultLike | undefined;
    try {
      second = (await sendInvitation(
        null,
        form({ email: EMAIL, role: 'member' }),
      )) as ResultLike;
    } catch (e) {
      threw = String(e);
    }

    expect(
      threw,
      'A duplicate-pending invite must return a Result, never throw — a thrown 23505 would 500 the form. The action let the unique violation escape instead of catching it.',
    ).toBe('');
    expect(
      second?.error?.code,
      "A second invite to the same pending email must return err('conflict') — the partial unique index (organizationId, lower(email)) WHERE status='pending' raises 23505, which isUniqueViolation maps to conflict.",
    ).toBe('conflict');
  });
});

describe('req 5 — inviting an existing member returns conflict via the pre-check', () => {
  // Carol is a seeded Acme member; no row is written, so nothing to clean up.
  it('returns conflict with a membership message, distinct from the duplicate-pending one', async () => {
    const sendInvitation = await loadSendInvitation();

    const result = (await sendInvitation(
      null,
      form({ email: 'carol@acme.test', role: 'member' }),
    )) as ResultLike;

    expect(
      result.error?.code,
      "Inviting an email that already belongs to a member of the org must return err('conflict').",
    ).toBe('conflict');
    expect(
      result.error?.userMessage?.toLowerCase(),
      'The already-member conflict must carry a distinct message (mentioning "member"), fired by the membership pre-check before any insert — not the duplicate-pending index message.',
    ).toContain('member');
    expect(
      await inviteRowByEmail('carol@acme.test'),
      'The membership pre-check must short-circuit before any insert — no invitation row may be written for an existing member.',
    ).toBeNull();
  });
});

describe('req 6 — a rejected Resend send still commits the row, with emailSent: false', () => {
  const EMAIL = 'req6-sendfail@external.test';
  afterEach(async () => {
    await deleteInviteByEmail(EMAIL);
  });

  it('returns ok({ invitationId, emailSent: false }) and leaves the row intact', async () => {
    const sendInvitation = await loadSendInvitation();

    emailShouldFail = true;
    const result = (await sendInvitation(
      null,
      form({ email: EMAIL, role: 'member' }),
    )) as ResultLike;

    expect(
      result.ok,
      'A Resend failure must NOT fail the action — the row already committed (send-after-commit), so a failed send is a flag on the success shape, not an error branch. The action returned ok: false instead.',
    ).toBe(true);
    expect(
      result.data?.emailSent,
      'When sendEmail returns a failure Result, the action must surface emailSent: false (so the UI can offer a resend), not swallow it.',
    ).toBe(false);
    expect(
      typeof result.data?.invitationId,
      'A failed send must still return the committed invitationId.',
    ).toBe('string');

    const row = await inviteRowByEmail(EMAIL);
    expect(
      row?.status,
      'The invitation row must survive a failed send — the send sits OUTSIDE the transaction, so a Resend outage leaves the row (and a resend affordance), never rolls it back.',
    ).toBe('pending');
  });
});
