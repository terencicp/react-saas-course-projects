import { getTableConfig } from 'drizzle-orm/pg-core';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Lesson 3 — Append-only audit_logs with RLS.
//
// Covers the [tested] functional requirements:
//   req 1 — the auditLogs table exists with its full column set and both
//           composite indexes.
//   req 2 — as `authenticated` inside a transaction that set app.org_id, an
//           INSERT into audit_logs succeeds (exercised through withTenant + logAudit).
//   req 3 — the same insert with app.org_id unset is refused.
//   req 4 — UPDATE audit_logs matches zero rows for `authenticated` (UPDATE 0).
//   req 5 — DELETE FROM audit_logs matches zero rows for `authenticated` (DELETE 0).
//   req 6 — a SELECT with app.org_id unset returns 0 rows rather than erroring.
//   req 7 — logAudit(tx, event) inserts exactly one row. (The "does not typecheck
//           when called with a bare db" half is a compile-time guarantee enforced by
//           logAudit's Transaction-only signature; only the runtime one-row insert is
//           asserted here.)
//
// Node env, no DOM. Two observation layers:
//   - The Drizzle schema object the migration is generated from — its columns,
//     indexes, RLS flag, and policy predicates (req 1, plus the policy *declarations*
//     behind reqs 3-6). Every assertion is anchored on the student's exported
//     `auditLogs` object, so an unimplemented start fails informatively even though
//     the shared Docker DB may already carry the table.
//   - The live Postgres, exercised as the `authenticated` role inside rolled-back
//     transactions, to prove the policies actually bite (reqs 2-6). These run through
//     the student's `withTenant` / `logAudit` / `auditLogs`, so an unimplemented start
//     fails before touching the wire, and a stopped DB / un-migrated schema surfaces
//     as an informative assertion failure rather than a runner crash.

// `server-only` throws on import under Node; neutralise it so the @/db modules load.
vi.mock('server-only', () => ({}));
// logAudit reads `await headers()`, which throws outside a request scope. A bare
// Headers object is all it needs to derive actorIp / actorUserAgent.
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers({
      'x-forwarded-for': '203.0.113.7',
      'user-agent': 'lesson-3-test',
    }),
}));
// logAudit derives actor/org from requireOrgUser. Stub it so the writer has a
// concrete org (org_acme — the seeded org) without standing up Better Auth.
vi.mock('@/lib/auth', () => ({
  requireOrgUser: async () => ({
    user: { id: 'user_alice', email: 'alice@acme.test', name: 'Alice' },
    orgId: 'org_acme',
    role: 'owner',
  }),
}));

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

// org_acme is the org the dev seed creates and that carries the one seeded audit row.
const ORG = 'org_acme';

// A drizzle pg table, loosely typed for the few introspection/query points the
// runner touches (getTableConfig accepts it; .id is the column the SELECTs read).
type TableLike = Parameters<typeof getTableConfig>[0] & { id: unknown };

// Resolve the student's auditLogs table object, failing with a clear message if the
// table has not been defined yet (start: `src/db/audit.ts` is an empty stub).
const loadAuditTable = async (): Promise<TableLike> => {
  const mod = (await import('@/db/audit')) as { auditLogs?: unknown };
  const auditLogs = mod.auditLogs;
  expect(
    auditLogs,
    'No auditLogs table is exported from src/db/audit.ts yet. Define the pgTable there with its columns, indexes, and RLS policies.',
  ).toBeDefined();
  return auditLogs as TableLike;
};

// A db client loosely typed for what the runner needs: the dialect (to render policy
// predicates) and transaction. Imported via this caster so an unstubbed start loads.
type DbLike = {
  dialect: { sqlToQuery: (s: unknown) => { sql: string } };
  transaction: (fn: (tx: TxLike) => Promise<unknown>) => Promise<unknown>;
};
type TxLike = {
  execute: (s: unknown) => Promise<unknown>;
  select: (s: unknown) => { from: (table: unknown) => Promise<unknown[]> };
  insert: (table: unknown) => { values: (v: unknown) => Promise<unknown> };
  update: (table: unknown) => {
    set: (v: unknown) => Promise<{ count?: number; length?: number }>;
  };
  delete: (table: unknown) => Promise<{ count?: number; length?: number }>;
  rollback: () => void;
};
const loadDb = async (): Promise<DbLike> =>
  ((await import('@/db')) as unknown as { db: DbLike }).db;

// Render a policy predicate (a drizzle SQL object) to text via the db dialect so we
// can assert what the policy *means*, not just that a policy with some name exists.
const renderSql = (
  dialect: { sqlToQuery: (s: unknown) => { sql: string } },
  sqlObj: unknown,
) => (sqlObj ? dialect.sqlToQuery(sqlObj).sql : '');

describe('req 1 — the audit_logs table has its full column set and both composite indexes', () => {
  it('declares every audit column with the right type and nullability', async () => {
    const auditLogs = await loadAuditTable();
    const cfg = getTableConfig(auditLogs);

    expect(
      cfg.name,
      'The audit table must map to the SQL name "audit_logs".',
    ).toBe('audit_logs');

    // Drizzle reports each column under its model (camelCase) name; getSQLType()
    // gives the underlying SQL type the migration emits.
    const byName = new Map(cfg.columns.map((c) => [c.name, c]));
    const expected: Record<string, { sqlType: string; notNull: boolean }> = {
      id: { sqlType: 'uuid', notNull: true },
      organizationId: { sqlType: 'text', notNull: true },
      actorUserId: { sqlType: 'text', notNull: false },
      actorIp: { sqlType: 'text', notNull: false },
      actorUserAgent: { sqlType: 'text', notNull: false },
      action: { sqlType: 'text', notNull: true },
      subjectType: { sqlType: 'text', notNull: true },
      subjectId: { sqlType: 'text', notNull: true },
      payload: { sqlType: 'jsonb', notNull: true },
      createdAt: { sqlType: 'timestamp with time zone', notNull: true },
    };

    for (const [name, want] of Object.entries(expected)) {
      const col = byName.get(name);
      expect(
        col,
        `audit_logs is missing the ${name} column. The full column set is id, organizationId, actorUserId, actorIp, actorUserAgent, action, subjectType, subjectId, payload, createdAt.`,
      ).toBeDefined();
      if (!col) continue;
      expect(
        col.getSQLType(),
        `audit_logs.${name} has the wrong SQL type. organization_id / actor_user_id are text (Better Auth ids are base62 text, not uuid); actor_ip is text (no first-class inet builder); payload is jsonb; created_at is timestamptz.`,
      ).toBe(want.sqlType);
      expect(
        col.notNull,
        `audit_logs.${name} has the wrong nullability. actor_user_id / actor_ip / actor_user_agent are nullable; everything else is NOT NULL.`,
      ).toBe(want.notNull);
    }
  });

  it('declares both per-org composite indexes', async () => {
    const auditLogs = await loadAuditTable();
    const cfg = getTableConfig(auditLogs);
    const names = cfg.indexes.map((i) => i.config.name);

    expect(
      names,
      'audit_logs must declare idx_audit_logs_org_created (organization_id, created_at desc) — it serves the per-org audit tail.',
    ).toContain('idx_audit_logs_org_created');
    expect(
      names,
      'audit_logs must declare idx_audit_logs_org_actor_created (organization_id, actor_user_id, created_at desc) — it serves per-actor reads.',
    ).toContain('idx_audit_logs_org_actor_created');
  });
});

describe('req 3-6 (declarations) — RLS is enabled with org-isolation + deny-UPDATE + deny-DELETE policies', () => {
  it('enables row-level security and declares exactly the three policies', async () => {
    const auditLogs = await loadAuditTable();
    const cfg = getTableConfig(auditLogs);

    expect(
      cfg.enableRLS,
      'audit_logs must call .enableRLS(). Without RLS enabled the deny-write policies never apply and the append-only guarantee is gone.',
    ).toBe(true);

    const names = cfg.policies.map((p) => p.name).sort();
    expect(
      names,
      'audit_logs must declare three policies: audit_logs_org_isolation, audit_logs_no_update, audit_logs_no_delete.',
    ).toEqual(
      [
        'audit_logs_no_delete',
        'audit_logs_no_update',
        'audit_logs_org_isolation',
      ].sort(),
    );
  });

  it('the org-isolation policy is permissive FOR ALL and compares organization_id to current_setting(app.org_id)', async () => {
    const auditLogs = await loadAuditTable();
    const db = await loadDb();
    const cfg = getTableConfig(auditLogs);
    const policy = cfg.policies.find(
      (p) => p.name === 'audit_logs_org_isolation',
    ) as
      | { as?: string; for?: string; using?: unknown; withCheck?: unknown }
      | undefined;

    expect(
      policy,
      'audit_logs must declare an audit_logs_org_isolation policy.',
    ).toBeDefined();
    expect(
      policy?.as,
      'audit_logs_org_isolation must be permissive (it grants SELECT + INSERT).',
    ).toBe('permissive');
    expect(
      policy?.for,
      'audit_logs_org_isolation must be FOR ALL so it governs both reads and inserts.',
    ).toBe('all');

    const using = renderSql(db.dialect, policy?.using);
    const withCheck = renderSql(db.dialect, policy?.withCheck);

    for (const [label, text] of [
      ['using', using],
      ['withCheck', withCheck],
    ] as const) {
      expect(
        text,
        `audit_logs_org_isolation.${label} must reference organization_id — the policy scopes rows to one org.`,
      ).toMatch(/organization_id/);
      expect(
        text,
        `audit_logs_org_isolation.${label} must read current_setting('app.org_id', true) — the second arg true makes a missing setting NULL (policy false, fail-closed) instead of a 500.`,
      ).toMatch(/current_setting\('app\.org_id',\s*true\)/);
      expect(
        text,
        `audit_logs_org_isolation.${label} must compare organization_id directly to current_setting — no ::uuid cast, since both sides are text.`,
      ).not.toMatch(/::uuid|::text/);
    }
  });

  it('the deny-UPDATE and deny-DELETE policies are restrictive with a using predicate that admits no row', async () => {
    const auditLogs = await loadAuditTable();
    const db = await loadDb();
    const cfg = getTableConfig(auditLogs);

    for (const [name, command] of [
      ['audit_logs_no_update', 'update'],
      ['audit_logs_no_delete', 'delete'],
    ] as const) {
      const policy = cfg.policies.find((p) => p.name === name);
      expect(
        policy?.as,
        `${name} must be restrictive — a restrictive policy intersects (AND), so it can deny what the permissive org-isolation policy would otherwise allow.`,
      ).toBe('restrictive');
      expect(
        policy?.for,
        `${name} must target the ${command.toUpperCase()} command.`,
      ).toBe(command);
      const using = renderSql(
        db.dialect,
        (policy as { using?: unknown } | undefined)?.using,
      );
      expect(
        using.replace(/\s/g, '').toLowerCase(),
        `${name}.using must be sql\`false\` — a predicate no row can satisfy, so every ${command.toUpperCase()} matches zero rows.`,
      ).toBe('false');
    }
  });
});

describe('req 2 — an audit insert succeeds inside a tenant transaction that set app.org_id', () => {
  it('logAudit writes a row through a withTenant transaction', async () => {
    const { withTenant } = await import('@/db/tenant');
    const { logAudit } = await import('@/db/audit-log');
    const auditLogs = await loadAuditTable();
    const { sql } = await import('drizzle-orm');

    let inserted = -1;
    let setting = '';
    await withTenant(ORG, async (rawTx) => {
      const tx = rawTx as unknown as TxLike;
      // Confirm withTenant set the transaction-local app.org_id the policy reads.
      const cfg = (await tx.execute(
        sql`select current_setting('app.org_id', true) as v`,
      )) as unknown as Array<{ v: string | null }>;
      setting = cfg[0]?.v ?? '';

      const before = await tx.select({ id: auditLogs.id }).from(auditLogs);
      await logAudit(rawTx as never, {
        action: 'lesson3.test.insert',
        subjectType: 'member',
        subjectId: 'm_test',
      });
      const after = await tx.select({ id: auditLogs.id }).from(auditLogs);
      inserted = after.length - before.length;

      // Roll back so the test leaves no row behind; the rollback discards the insert.
      tx.rollback();
    }).catch((e: unknown) => {
      // db.transaction re-throws the rollback sentinel; swallow only that.
      if (!String(e).includes('Rollback')) throw e;
    });

    expect(
      setting,
      "withTenant must run set_config('app.org_id', orgId, true) before the callback so the org-isolation policy can match the inserted row. The transaction-local setting was not visible inside the callback.",
    ).toBe(ORG);
    expect(
      inserted,
      'An audit insert inside a withTenant transaction must succeed (one row added). If this errored against a live DB, check the Docker Postgres is running and the L3 migration is applied.',
    ).toBe(1);
  });
});

describe('req 3 — an audit insert with app.org_id unset is refused', () => {
  it('the org-isolation withCheck rejects an insert by the authenticated role when app.org_id is NULL', async () => {
    const db = await loadDb();
    const auditLogs = await loadAuditTable();
    const { sql } = await import('drizzle-orm');
    const { uuidv7 } = await import('uuidv7');

    let blocked = false;
    let unexpected = '';
    try {
      await db.transaction(async (tx) => {
        // Become the request role; superuser bypasses RLS, so the policy only bites here.
        await tx.execute(sql`set local role authenticated`);
        // No set_config: app.org_id is NULL, so the org-isolation withCheck is false.
        await tx.insert(auditLogs).values({
          id: uuidv7(),
          organizationId: ORG,
          action: 'lesson3.test.refused',
          subjectType: 'member',
          subjectId: 'm_test',
        });
        tx.rollback();
      });
    } catch (e) {
      // Drizzle wraps the driver error; the SQLSTATE 42501 and the "row-level
      // security" text live on the original error and/or its `.cause`.
      const top = e as { code?: string; cause?: { code?: string } };
      const msg = `${String(e)} ${String(top?.cause ?? '')}`;
      if (msg.includes('Rollback')) {
        unexpected =
          'insert was NOT refused (the transaction reached rollback)';
      } else if (
        msg.includes('row-level security') ||
        top?.code === '42501' ||
        top?.cause?.code === '42501'
      ) {
        blocked = true;
      } else {
        unexpected = msg;
      }
    }

    expect(
      unexpected,
      'Inserting into audit_logs as the authenticated role with app.org_id unset must be refused by the org-isolation withCheck, not succeed and not error for another reason. (If this names a connection error, start the Docker Postgres and apply the L3 migration.)',
    ).toBe('');
    expect(
      blocked,
      "With app.org_id unset, current_setting('app.org_id', true) is NULL, the org-isolation withCheck evaluates false, and the insert must raise a row-level-security violation.",
    ).toBe(true);
  });
});

describe('req 4 & 5 — UPDATE and DELETE match zero rows for the authenticated role', () => {
  it('UPDATE audit_logs reports zero affected rows (UPDATE 0)', async () => {
    const db = await loadDb();
    const auditLogs = await loadAuditTable();
    const { sql } = await import('drizzle-orm');

    let count = -1;
    await db
      .transaction(async (tx) => {
        await tx.execute(sql`set local role authenticated`);
        await tx.execute(sql`select set_config('app.org_id', ${ORG}, true)`);
        const res = await tx.update(auditLogs).set({ action: 'tampered' });
        count = res.count ?? res.length ?? -1;
        tx.rollback();
      })
      .catch((e: unknown) => {
        if (!String(e).includes('Rollback')) throw e;
      });

    expect(
      count,
      'An UPDATE on audit_logs as the authenticated role must affect zero rows (the deny-UPDATE restrictive policy uses sql`false`, so no row qualifies). A non-zero count means the deny-UPDATE policy is missing or not restrictive.',
    ).toBe(0);
  });

  it('DELETE FROM audit_logs reports zero affected rows (DELETE 0)', async () => {
    const db = await loadDb();
    const auditLogs = await loadAuditTable();
    const { sql } = await import('drizzle-orm');

    let count = -1;
    await db
      .transaction(async (tx) => {
        await tx.execute(sql`set local role authenticated`);
        await tx.execute(sql`select set_config('app.org_id', ${ORG}, true)`);
        const res = await tx.delete(auditLogs);
        count = res.count ?? res.length ?? -1;
        tx.rollback();
      })
      .catch((e: unknown) => {
        if (!String(e).includes('Rollback')) throw e;
      });

    expect(
      count,
      'A DELETE on audit_logs as the authenticated role must affect zero rows (the deny-DELETE restrictive policy uses sql`false`). A non-zero count means the deny-DELETE policy is missing or not restrictive.',
    ).toBe(0);
  });
});

describe('req 6 — a SELECT with app.org_id unset returns 0 rows rather than erroring', () => {
  it('the authenticated role sees no rows when app.org_id is NULL', async () => {
    const db = await loadDb();
    const auditLogs = await loadAuditTable();
    const { sql } = await import('drizzle-orm');

    let rows = -1;
    let errored = '';
    await db
      .transaction(async (tx) => {
        await tx.execute(sql`set local role authenticated`);
        // app.org_id deliberately unset.
        const r = await tx.select({ id: auditLogs.id }).from(auditLogs);
        rows = r.length;
        tx.rollback();
      })
      .catch((e: unknown) => {
        if (!String(e).includes('Rollback')) errored = String(e);
      });

    expect(
      errored,
      'Selecting from audit_logs as the authenticated role with app.org_id unset must NOT error — the `, true` flag on current_setting makes the missing setting NULL, so the policy evaluates false and filters rows out fail-closed. (A connection error here means the Docker Postgres is not running.)',
    ).toBe('');
    expect(
      rows,
      'With app.org_id unset, the org-isolation policy matches no rows, so the SELECT must return 0 rows.',
    ).toBe(0);
  });
});

describe('req 7 — logAudit inserts exactly one row inside a transaction', () => {
  // The "does not typecheck with a bare db" half is a compile-time guarantee: logAudit's
  // first parameter is typed Transaction with no db overload, so an off-transaction call
  // is rejected by tsc. The runner asserts the runtime-observable half — one row inserted.
  it('adds a single audit row for the event it is given', async () => {
    const db = await loadDb();
    const { logAudit } = await import('@/db/audit-log');
    const auditLogs = await loadAuditTable();
    const { sql } = await import('drizzle-orm');

    let delta = -1;
    await db
      .transaction(async (tx) => {
        // logAudit's insert is governed by the org-isolation withCheck, so set app.org_id.
        await tx.execute(sql`select set_config('app.org_id', ${ORG}, true)`);
        const before = await tx.select({ id: auditLogs.id }).from(auditLogs);
        await logAudit(tx as never, {
          action: 'lesson3.test.one-row',
          subjectType: 'member',
          subjectId: 'm_test',
        });
        const after = await tx.select({ id: auditLogs.id }).from(auditLogs);
        delta = after.length - before.length;
        tx.rollback();
      })
      .catch((e: unknown) => {
        if (!String(e).includes('Rollback')) throw e;
      });

    expect(
      delta,
      'logAudit must insert exactly one audit row per call. A delta of 0 means the insert never ran; more than 1 means it wrote multiple rows. (If this errored, confirm logAudit takes the Transaction and inserts a single auditLogs row.)',
    ).toBe(1);
  });
});
