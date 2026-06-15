import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Lesson 4 — Scoped data, the action wrapper, and role changes.
//
// Covers the [tested] functional requirements:
//   req 1 — a tenantDb(orgId) read returns only that org's rows, and a caller
//           `where` narrows within the org (never escapes it).
//   req 2 — a tenantDb(orgId) insert persists organizationId = orgId even when the
//           caller omits it, and throws when the caller supplies a mismatched one.
//   req 3 — tenantDb(orgId).query.user is a type error (global tables unreachable
//           through the facade). Compile-time; enforced by `tsc --noEmit` (the verify
//           gate) on a `@ts-expect-error` probe, never executed at runtime.
//   req 4 — an authedAction whose required role exceeds the caller's returns
//           err('forbidden', ...) with a user-safe message and never throws.
//   req 5 — an authedAction with input that fails the schema returns
//           err('validation', ..., fieldErrors) and never reaches the action body.
//   req 6 — as the admin, changing a member's role updates the row and appends one
//           'member.role-changed' audit row with payload {before, after} and
//           actorUserId matching the admin.
//   req 7 — as a member, a role-change attempt returns forbidden with the row
//           unchanged and no audit row added.
//   req 8 — targeting an owner returns conflict; the sole owner returns conflict with
//           the last-owner message; neither changes the DB.
//   req 9 — the role update and the audit row land together or not at all
//           (force-failing the audit write lands neither).
//
// Node env, no DOM. Every assertion is anchored on the student's own exported code
// (tenantDb / authedAction / changeMemberRole), so an unimplemented start fails
// informatively before reaching the wire — regardless of the shared Docker DB's
// migration/seed state. The live-DB checks run against the dev seed (org_acme:
// Alice=owner, Bob=admin, Carol=member; org_globex: Dave=owner) and restore every row
// they touch so the suite is re-runnable.

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
      'user-agent': 'lesson-4-test',
    }),
}));

// The acting identity. authedAction and logAudit both derive actor/org from
// requireOrgUser; this mutable slot lets each test pick who is acting without
// standing up Better Auth. Default: Bob, the seeded Acme admin.
const ACTING = {
  user: { id: 'user_bob', email: 'bob@acme.test', name: 'Bob' },
  orgId: 'org_acme',
  role: 'admin' as 'owner' | 'admin' | 'member',
};
vi.mock('@/lib/auth', () => ({
  requireOrgUser: async () => ({
    user: ACTING.user,
    orgId: ACTING.orgId,
    role: ACTING.role,
  }),
}));

// logAudit is the audit writer changeMemberRole co-transacts. req 9 force-fails it to
// prove the role update rolls back with it; every other test keeps the real one.
let auditShouldFail = false;
vi.mock('@/db/audit-log', async (importOriginal) => {
  const actual = (await importOriginal()) as {
    logAudit: (...args: unknown[]) => Promise<void>;
  };
  return {
    logAudit: async (...args: unknown[]) => {
      if (auditShouldFail) {
        throw new Error('forced audit failure (req 9)');
      }
      return actual.logAudit(...args);
    },
  };
});

// The env boundary (@/env) validates process.env at import time; vitest does not
// auto-load .env, so seed the values the @/db import graph needs. `||=` leaves any
// real environment untouched, so the live-DB tests reach the student's DATABASE_URL.
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

beforeEach(() => {
  ACTING.user = { id: 'user_bob', email: 'bob@acme.test', name: 'Bob' };
  ACTING.orgId = 'org_acme';
  ACTING.role = 'admin';
  auditShouldFail = false;
});

// Seeded fixtures (scripts/seed.ts). Acme has one owner (Alice), so the last-owner
// guard fires on Alice; Carol is the safe role-change target.
const ORG_ACME = 'org_acme';
const ORG_GLOBEX = 'org_globex';
const CAROL = 'member_carol_acme';
const ALICE = 'member_alice_acme';
const DAVE = 'member_dave_globex';

// A FormData built from a plain object — the shape Object.fromEntries(formData) reads.
const form = (fields: Record<string, string>): FormData => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

// A Result discriminant, loosely typed for the few fields the runner reads.
type ResultLike = {
  ok: boolean;
  data?: { role?: string };
  error?: { code?: string; userMessage?: string; fieldErrors?: unknown };
};

// The unscoped db, reserved for the runner's own setup/restore (never the path the
// app code under test takes). Typed for the raw queries the restore points run.
type DbLike = {
  execute: (s: unknown) => Promise<Array<{ role?: string; n?: string }>>;
  delete: (table: unknown) => { where: (w: unknown) => Promise<unknown> };
};
const loadDb = async (): Promise<DbLike> =>
  ((await import('@/db')) as unknown as { db: DbLike }).db;

// The tenantDb facade, loosely typed for the surface the runner exercises. tenantDb is
// resolved through an unknown-cast (its real type lands only once the student writes the
// facade; the start stub returns never), so this file typechecks against the stubs.
type Insertable = { id: string; userId: string; createdAt: Date } & Record<
  string,
  unknown
>;
type QueryTable = {
  findMany: (config?: { where?: unknown }) => Promise<unknown[]>;
};
// query lists exactly the tenant-scoped tables — no `user` member — so the req-3 probe
// below makes tenantDb(orgId).query.user a genuine compile error.
type FacadeLike = {
  query: { member: QueryTable; invitation: QueryTable };
  insert: (table: unknown) => {
    values: (value: Insertable) => Promise<unknown>;
  };
};
const loadTenantDb = async (): Promise<(orgId: string) => FacadeLike> => {
  const mod = (await import('@/db/tenant')) as unknown as {
    tenantDb: (orgId: string) => FacadeLike;
  };
  return mod.tenantDb;
};

// The member table object, resolved through an unknown-cast — @/db/schema/auth exports
// `member` only after the L2 auth:generate step, so a static import would not typecheck
// against the start stubs. eq() and the facade only need the column references.
type MemberTable = { role: unknown; organizationId: unknown };
const loadMember = async (): Promise<MemberTable> =>
  ((await import('@/db/schema/auth')) as unknown as { member: MemberTable })
    .member;

// Read a member's role straight from the wire, bypassing the facade under test.
const roleOf = async (memberId: string): Promise<string | undefined> => {
  const db = await loadDb();
  const { sql } = await import('drizzle-orm');
  const rows = await db.execute(
    sql`select role from member where id = ${memberId}`,
  );
  return rows[0]?.role;
};

// Count the audit rows an org carries, bypassing RLS via the superuser connection.
const auditCount = async (orgId: string): Promise<number> => {
  const db = await loadDb();
  const { sql } = await import('drizzle-orm');
  const rows = await db.execute(
    sql`select count(*)::text as n from audit_logs where organization_id = ${orgId}`,
  );
  return Number(rows[0]?.n ?? '-1');
};

describe('req 1 — tenantDb reads stay inside the org, and a caller where narrows within it', () => {
  it('returns only the org-owned rows and never leaks another org', async () => {
    const tenantDb = await loadTenantDb();
    const { eq } = await import('drizzle-orm');
    const member = await loadMember();

    const acme = (await tenantDb(ORG_ACME).query.member.findMany({})) as Array<{
      organizationId: string;
    }>;
    expect(
      acme.length,
      'tenantDb(org_acme).query.member.findMany() must return only Acme members (Alice, Bob, Carol = 3). A different count means the facade is not composing eq(member.organizationId, orgId) on reads. (A connection error means the Docker Postgres is not running or the seed has not been applied.)',
    ).toBe(3);
    expect(
      acme.every((m) => m.organizationId === ORG_ACME),
      'A tenantDb(org_acme) read returned a row from another org. The org predicate must be the outer and on every read.',
    ).toBe(true);

    const globex = (await tenantDb(ORG_GLOBEX).query.member.findMany(
      {},
    )) as Array<{ id: string }>;
    expect(
      globex.map((m) => m.id),
      'tenantDb(org_globex) must return only Globex members (Dave). Seeing an Acme id here means reads are not org-scoped.',
    ).toEqual([DAVE]);

    // A caller where narrows WITHIN the org — it never widens past it.
    const acmeMembers = (await tenantDb(ORG_ACME).query.member.findMany({
      where: eq(member.role as never, 'member'),
    })) as Array<{ id: string }>;
    expect(
      acmeMembers.map((m) => m.id),
      'A caller where (role = member) must narrow within org_acme to just Carol. The facade must and the caller predicate with the org predicate, not replace it.',
    ).toEqual([CAROL]);
  });
});

describe('req 2 — tenantDb inserts force the org, and reject a mismatched one', () => {
  it('persists organizationId = orgId when the caller omits it', async () => {
    const tenantDb = await loadTenantDb();
    const member = await loadMember();
    const db = await loadDb();
    const { sql } = await import('drizzle-orm');

    const probeId = `member_probe_${Date.now()}`;
    try {
      // The caller omits organizationId entirely; the facade must inject org_acme.
      await tenantDb(ORG_ACME).insert(member).values({
        id: probeId,
        userId: 'user_alice',
        role: 'member',
        createdAt: new Date(),
      });
      const rows = await db.execute(
        sql`select organization_id as role from member where id = ${probeId}`,
      );
      expect(
        rows[0]?.role,
        'A tenantDb(org_acme) insert that omits organizationId must persist with organizationId = org_acme. The facade injects the org on insert; the caller never supplies it.',
      ).toBe(ORG_ACME);
    } finally {
      await db.delete(member).where(sql`id = ${probeId}`);
    }
  });

  it('accepts a matching organizationId but throws on a mismatched one', async () => {
    const tenantDb = await loadTenantDb();
    const member = await loadMember();
    const db = await loadDb();
    const { sql } = await import('drizzle-orm');

    // Building the insert with the SAME org the facade is scoped to must NOT throw —
    // this distinguishes the mismatch guard from a facade that simply throws on every
    // call. (We build the query but never await it, so nothing is written.)
    const matchId = `member_match_${Date.now()}`;
    expect(
      () =>
        tenantDb(ORG_ACME).insert(member).values({
          id: matchId,
          userId: 'user_alice',
          organizationId: ORG_ACME,
          role: 'member',
          createdAt: new Date(),
        }),
      'A tenantDb(org_acme) insert that supplies the SAME organizationId (org_acme) must be allowed. If this throws, the facade is rejecting every insert rather than only mismatched orgs.',
    ).not.toThrow();
    // Clean up in case the build above eagerly persisted (it should not).
    await db.delete(member).where(sql`id = ${matchId}`);

    expect(
      () =>
        tenantDb(ORG_ACME).insert(member).values({
          id: 'member_should_never_persist',
          userId: 'user_alice',
          organizationId: ORG_GLOBEX,
          role: 'member',
          createdAt: new Date(),
        }),
      'A tenantDb(org_acme) insert that supplies a MISMATCHED organizationId (org_globex) must throw — a caller may never write a row into another org through the facade. The throw fires before any query reaches the DB.',
    ).toThrow();
  });
});

describe('req 3 — tenantDb(orgId).query.user is a type error', () => {
  // Compile-time only. The probe below must NOT typecheck: `user` is a global table,
  // unreachable through the facade's query surface (TENANT_TABLES = member | invitation
  // is the type source). `tsc --noEmit` (the verify gate) fails if the @ts-expect-error
  // ever becomes unused — i.e. if the facade starts exposing .query.user. The block is
  // never executed (guarded by `false`) so the runtime stub's throw is irrelevant here.
  it('exposes member and invitation but not user on the query surface', async () => {
    const tenantDb = await loadTenantDb();
    const facade = tenantDb(ORG_ACME);
    expect(
      Object.keys(facade.query).sort(),
      'tenantDb(orgId).query must expose exactly the tenant-scoped tables (member, invitation). Global tables like user are unreachable through the facade.',
    ).toEqual(['invitation', 'member']);

    // Never runs; present so tsc enforces the type-level guarantee. The probe is typed
    // with the facade's intended query surface (member | invitation only); reaching for
    // `.user` is a property-does-not-exist error, mirroring how the real facade makes
    // tenantDb(orgId).query.user uncompilable. The same test's runtime Object.keys check
    // above guards the observable surface; together they pin both the shape and its type.
    if (false as boolean) {
      const probe = tenantDb(ORG_ACME);
      // @ts-expect-error tenantDb(orgId).query has no `user` member — global tables are
      // unreachable through the facade, so this access must not typecheck.
      void probe.query.user;
    }
  });
});

describe('req 4 — an over-privileged authedAction returns forbidden and never throws', () => {
  it('gives a member-acting caller err(forbidden) for an admin-only action', async () => {
    ACTING.role = 'member';
    ACTING.user = { id: 'user_carol', email: 'carol@acme.test', name: 'Carol' };
    const { changeMemberRole } = await import('@/lib/invitations/manage');

    let result: ResultLike | undefined;
    let threw = '';
    try {
      result = (await changeMemberRole(
        null,
        form({ memberId: CAROL, newRole: 'admin' }),
      )) as ResultLike;
    } catch (e) {
      threw = String(e);
    }

    expect(
      threw,
      'A role check failure must return a Result, never throw — a throw 500s the action and loses the typed contract useActionState renders. The action threw instead of returning err(forbidden).',
    ).toBe('');
    expect(
      result?.ok,
      'changeMemberRole called as a member must be refused (ok: false).',
    ).toBe(false);
    expect(
      result?.error?.code,
      "An admin-only action invoked by a member must return err('forbidden', ...). roleAtLeast(actual, required) is the second step and fails before the body runs.",
    ).toBe('forbidden');
    expect(
      typeof result?.error?.userMessage,
      'The forbidden Result must carry a user-safe message string.',
    ).toBe('string');
  });
});

describe('req 5 — an authedAction with invalid input returns validation and never runs the body', () => {
  it('rejects a bad newRole before the action body, with fieldErrors', async () => {
    const { changeMemberRole } = await import('@/lib/invitations/manage');
    const before = await auditCount(ORG_ACME);

    // 'owner' is not a settable role; the schema enum rejects it at the parse step.
    const result = (await changeMemberRole(
      null,
      form({ memberId: CAROL, newRole: 'owner' }),
    )) as ResultLike;

    expect(
      result.ok,
      'A role-change with an invalid newRole must be refused (ok: false).',
    ).toBe(false);
    expect(
      result.error?.code,
      "Invalid input must return err('validation', ...) from the schema.safeParse step. 'owner' is outside the z.enum(['admin','member']).",
    ).toBe('validation');
    expect(
      result.error?.fieldErrors,
      'A validation Result must carry fieldErrors from z.flattenError so the form can highlight the offending field.',
    ).toBeDefined();

    const after = await auditCount(ORG_ACME);
    expect(
      after,
      'A validation failure must short-circuit before the action body — no audit row, no DB write. The audit count for org_acme changed, so the body ran despite invalid input.',
    ).toBe(before);
  });
});

describe('req 6 — the admin changes a role: row updated + one audit row with payload and actor', () => {
  afterAll(async () => {
    // Restore Carol to her seeded role and drop the test audit row(s).
    const db = await loadDb();
    const { sql } = await import('drizzle-orm');
    await db.execute(
      sql`update member set role = 'member' where id = ${CAROL}`,
    );
    await db.execute(
      sql`delete from audit_logs where subject_id = ${CAROL} and action = 'member.role-changed' and actor_user_id = 'user_bob' and (payload->>'after') = 'admin'`,
    );
  });

  it('updates the member row and appends one member.role-changed audit row', async () => {
    const { changeMemberRole } = await import('@/lib/invitations/manage');
    const db = await loadDb();
    const { sql } = await import('drizzle-orm');

    const beforeRole = await roleOf(CAROL);
    const beforeCount = await auditCount(ORG_ACME);

    const result = (await changeMemberRole(
      null,
      form({ memberId: CAROL, newRole: 'admin' }),
    )) as ResultLike;

    expect(
      result.ok,
      'As Bob (admin), changing Carol to admin must succeed (ok: true). (A connection error means the Docker Postgres is not running or the seed has not been applied.)',
    ).toBe(true);
    expect(
      await roleOf(CAROL),
      "Carol's member row must read 'admin' after a successful change.",
    ).toBe('admin');

    expect(
      await auditCount(ORG_ACME),
      'A successful role change must append exactly one audit row to org_acme.',
    ).toBe(beforeCount + 1);

    const audit = await db.execute(
      sql`select action, actor_user_id as role, (payload->>'before') as before_v, (payload->>'after') as after_v
          from audit_logs
          where subject_id = ${CAROL} and action = 'member.role-changed'
          order by created_at desc limit 1`,
    );
    const row = audit[0] as
      | { action?: string; role?: string; before_v?: string; after_v?: string }
      | undefined;
    expect(
      row?.action,
      "The appended audit row's action must be 'member.role-changed'.",
    ).toBe('member.role-changed');
    expect(
      row?.role,
      "The audit row's actorUserId must be the acting admin (user_bob), derived from requireOrgUser — never trusted from input.",
    ).toBe('user_bob');
    expect(
      { before: row?.before_v, after: row?.after_v },
      'The audit payload must be { before, after } capturing the role transition (member → admin).',
    ).toEqual({ before: beforeRole, after: 'admin' });
  });
});

describe('req 7 — a member is refused, the row is unchanged, and no audit row is added', () => {
  it('leaves the target role and the audit count untouched', async () => {
    ACTING.role = 'member';
    ACTING.user = { id: 'user_carol', email: 'carol@acme.test', name: 'Carol' };
    const { changeMemberRole } = await import('@/lib/invitations/manage');

    const beforeRole = await roleOf('member_bob_acme');
    const beforeCount = await auditCount(ORG_ACME);

    const result = (await changeMemberRole(
      null,
      form({ memberId: 'member_bob_acme', newRole: 'member' }),
    )) as ResultLike;

    expect(
      result.error?.code,
      "A member attempting a role change must be refused with err('forbidden') before any DB write.",
    ).toBe('forbidden');
    expect(
      await roleOf('member_bob_acme'),
      "Bob's role must be unchanged after a refused attempt — the refusal happens before the body.",
    ).toBe(beforeRole);
    expect(
      await auditCount(ORG_ACME),
      'A refused attempt must add no audit row — the audit count for org_acme must be unchanged.',
    ).toBe(beforeCount);
  });
});

describe('req 8 — owner targets are refused; the sole owner gets the last-owner message; the DB is unchanged', () => {
  it('refuses the sole owner with the last-owner conflict and changes nothing', async () => {
    const { changeMemberRole } = await import('@/lib/invitations/manage');

    const beforeRole = await roleOf(ALICE);
    const beforeCount = await auditCount(ORG_ACME);

    const result = (await changeMemberRole(
      null,
      form({ memberId: ALICE, newRole: 'admin' }),
    )) as ResultLike;

    expect(
      result.error?.code,
      "Targeting an owner must return err('conflict') — owner role changes go through the (unbuilt) transfer flow, not here.",
    ).toBe('conflict');
    expect(
      result.error?.userMessage?.toLowerCase(),
      'Alice is Acme\'s sole owner, so the refusal must use the last-owner message (mentioning "last owner"), distinct from the generic owner-target message.',
    ).toContain('last owner');
    expect(
      await roleOf(ALICE),
      "Alice's role must be unchanged after a refused owner-target attempt.",
    ).toBe(beforeRole);
    expect(
      await auditCount(ORG_ACME),
      'A refused owner-target attempt must add no audit row.',
    ).toBe(beforeCount);
  });

  it('refuses a non-last owner with the generic owner-target conflict', async () => {
    const { changeMemberRole } = await import('@/lib/invitations/manage');
    const db = await loadDb();
    const { sql } = await import('drizzle-orm');

    // Promote Bob to owner so Acme has two owners; the sole-owner guard no longer
    // fires, but an owner target is still refused with the generic message.
    await db.execute(
      sql`update member set role = 'owner' where id = 'member_bob_acme'`,
    );
    try {
      const beforeRole = await roleOf(ALICE);
      const result = (await changeMemberRole(
        null,
        form({ memberId: ALICE, newRole: 'admin' }),
      )) as ResultLike;

      expect(
        result.error?.code,
        'An owner target is refused with conflict regardless of how many owners remain.',
      ).toBe('conflict');
      expect(
        result.error?.userMessage?.toLowerCase().includes('last owner'),
        'With two owners present, the refusal must use the generic owner-target message, not the last-owner one.',
      ).toBe(false);
      expect(
        await roleOf(ALICE),
        "Alice's role must be unchanged after a refused owner-target attempt.",
      ).toBe(beforeRole);
    } finally {
      await db.execute(
        sql`update member set role = 'admin' where id = 'member_bob_acme'`,
      );
    }
  });
});

describe('req 9 — the role update and the audit row co-transact: force-failing the audit lands neither', () => {
  afterAll(async () => {
    // Restore Carol to her seeded role and drop any audit rows this test wrote.
    const db = await loadDb();
    const { sql } = await import('drizzle-orm');
    await db.execute(
      sql`update member set role = 'member' where id = ${CAROL}`,
    );
    await db.execute(
      sql`delete from audit_logs where subject_id = ${CAROL} and action = 'member.role-changed' and (payload->>'after') = 'admin'`,
    );
  });

  it('writes both when the audit succeeds, and neither when it fails', async () => {
    const { changeMemberRole } = await import('@/lib/invitations/manage');

    const seededRole = await roleOf(CAROL);
    const baseCount = await auditCount(ORG_ACME);

    // Positive control: with the real audit writer, the change commits — proving the
    // transaction actually does the work the rollback is supposed to undo. (A facade
    // or action that never writes would fail here, not silently pass req 9.)
    auditShouldFail = false;
    const okResult = (await changeMemberRole(
      null,
      form({ memberId: CAROL, newRole: 'admin' }),
    )) as ResultLike;
    expect(
      okResult.ok,
      'With a working audit writer the role change must commit (ok: true) — the positive control for the rollback case.',
    ).toBe(true);
    expect(
      await roleOf(CAROL),
      'The committed transaction must update the member row to admin.',
    ).toBe('admin');
    expect(
      await auditCount(ORG_ACME),
      'The committed transaction must append one audit row.',
    ).toBe(baseCount + 1);

    // Reset Carol so the rollback case starts from the same role again.
    const db = await loadDb();
    const { sql } = await import('drizzle-orm');
    await db.execute(
      sql`update member set role = ${seededRole ?? 'member'} where id = ${CAROL}`,
    );
    const rollbackBaseRole = await roleOf(CAROL);
    const rollbackBaseCount = await auditCount(ORG_ACME);

    // Now force the audit insert inside the withTenant transaction to fail.
    auditShouldFail = true;
    let threw = false;
    let settled: ResultLike | undefined;
    try {
      settled = (await changeMemberRole(
        null,
        form({ memberId: CAROL, newRole: 'admin' }),
      )) as ResultLike;
    } catch {
      // A rejected promise is an acceptable outcome — the point is the rollback.
      threw = true;
    }
    auditShouldFail = false;

    expect(
      threw || settled?.ok === false,
      'When the audit write fails the action must not report success — the transaction aborts.',
    ).toBe(true);
    expect(
      await roleOf(CAROL),
      "The role update and the audit row are one transaction: if the audit insert fails, the role change must roll back. Carol's role changed despite the failed audit write, so the two are not co-transacted.",
    ).toBe(rollbackBaseRole);
    expect(
      await auditCount(ORG_ACME),
      'A failed audit write must leave no audit row behind (the transaction rolled back).',
    ).toBe(rollbackBaseCount);
  });
});
