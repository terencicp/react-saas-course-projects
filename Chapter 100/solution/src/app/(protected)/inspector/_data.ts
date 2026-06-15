import 'server-only';

import { eq, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { cache } from 'react';

import { ACTING_USER_COOKIE } from '@/app/(protected)/inspector/constants';
import { db } from '@/db';
import { member, organization } from '@/db/schema/auth';
import { requireOrgUser } from '@/lib/auth';

// The inspector's read path. Every probe is a raw db.execute(sql`…`) against
// information_schema / the invoices table by SQL literal — NEVER a typed query
// referencing invoices.subtotal/tax/total — so the SAME file compiles against both
// the total-only baseline (start) and the contracted finished schema (solution),
// and a build never breaks because a column the typed builder expects is absent.
// The panels render whatever the schema currently is; the pre-expand → post-
// contract progression IS the teaching surface, never a failure.

export type SchemaColumn = {
  name: string;
  nullable: boolean;
  dataType: string;
};

// The schema-state probe: the live column list for `invoices` from the catalog.
// This is the source of truth the other probes guard against (e.g. the data-
// integrity diff renders n/a once `total` is gone).
export const schemaColumns = cache(async (): Promise<SchemaColumn[]> => {
  const rows = await db.execute<{
    column_name: string;
    is_nullable: string;
    data_type: string;
  }>(sql`
    select column_name, is_nullable, data_type
    from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices'
    order by ordinal_position
  `);

  return Array.from(rows).map((row) => ({
    name: row.column_name,
    nullable: row.is_nullable === 'YES',
    dataType: row.data_type,
  }));
});

export const hasColumn = (columns: SchemaColumn[], name: string): boolean =>
  columns.some((column) => column.name === name);

export type SplitCoverage = {
  // null when the subtotal column does not yet exist (pre-expand).
  total: number;
  withSubtotal: number;
  nullSubtotal: number;
  pct: number;
  columnPresent: boolean;
};

// The split-coverage panel: how many rows have a backfilled `subtotal`. Reads the
// schema first so it renders a sane "pre-expand" state (0% / column absent) before
// the expand migration lands.
export const splitCoverage = async (orgId: string): Promise<SplitCoverage> => {
  const columns = await schemaColumns();
  if (!hasColumn(columns, 'subtotal')) {
    return {
      total: 0,
      withSubtotal: 0,
      nullSubtotal: 0,
      pct: 0,
      columnPresent: false,
    };
  }

  const rows = await db.execute<{
    total: string;
    with_subtotal: string;
    null_subtotal: string;
  }>(sql`
    select
      count(*)::text as total,
      count(subtotal)::text as with_subtotal,
      count(*) filter (where subtotal is null)::text as null_subtotal
    from invoices
    where organization_id = ${orgId}
  `);

  const row = Array.from(rows)[0];
  const total = Number(row?.total ?? 0);
  const withSubtotal = Number(row?.with_subtotal ?? 0);
  const nullSubtotal = Number(row?.null_subtotal ?? 0);
  const pct = total === 0 ? 100 : Math.round((withSubtotal / total) * 100);

  return { total, withSubtotal, nullSubtotal, pct, columnPresent: true };
};

export type DualWriteRow = {
  id: string;
  number: string;
  subtotal: string | null;
  tax: string | null;
  total: string | null;
};

// The dual-write probe: the recent 10 rows with whichever money columns exist.
// Selects subtotal/tax/total defensively via a catalog check so it never
// references a missing column.
export const recentMoneyRows = async (
  orgId: string,
): Promise<DualWriteRow[]> => {
  const columns = await schemaColumns();
  const hasSubtotal = hasColumn(columns, 'subtotal');
  const hasTax = hasColumn(columns, 'tax');
  const hasTotal = hasColumn(columns, 'total');

  const subtotalExpr = hasSubtotal ? sql`subtotal::text` : sql`null::text`;
  const taxExpr = hasTax ? sql`tax::text` : sql`null::text`;
  const totalExpr = hasTotal ? sql`total::text` : sql`null::text`;

  const rows = await db.execute<{
    id: string;
    number: string;
    subtotal: string | null;
    tax: string | null;
    total: string | null;
  }>(sql`
    select
      id::text as id,
      number,
      ${subtotalExpr} as subtotal,
      ${taxExpr} as tax,
      ${totalExpr} as total
    from invoices
    where organization_id = ${orgId}
    order by created_at desc
    limit 10
  `);

  return Array.from(rows).map((row) => ({
    id: row.id,
    number: row.number,
    subtotal: row.subtotal,
    tax: row.tax,
    total: row.total,
  }));
};

export type IntegrityState =
  | { kind: 'na' }
  | { kind: 'ok' }
  | { kind: 'divergent'; rows: { id: string; number: string }[] };

// The data-integrity diff: rows where subtotal + tax <> total (a dual-write
// divergence bug). Guards the missing column — once `total` is dropped by the
// contract migration the diff is meaningless, so it renders "n/a — total dropped".
export const dataIntegrity = async (orgId: string): Promise<IntegrityState> => {
  const columns = await schemaColumns();
  if (
    !hasColumn(columns, 'total') ||
    !hasColumn(columns, 'subtotal') ||
    !hasColumn(columns, 'tax')
  ) {
    return { kind: 'na' };
  }

  const rows = await db.execute<{ id: string; number: string }>(sql`
    select id::text as id, number
    from invoices
    where organization_id = ${orgId}
      and subtotal is not null
      and tax is not null
      and (subtotal + tax) <> total
    limit 20
  `);

  const divergent = Array.from(rows);
  return divergent.length === 0
    ? { kind: 'ok' }
    : { kind: 'divergent', rows: divergent };
};

export type AuditRow = { id: string; action: string; subjectId: string };

// The audit tail: the org's most-recent events, newest first — confirms the
// migration class did not lose audit coverage.
export const recentAudit = async (orgId: string): Promise<AuditRow[]> => {
  const rows = await db.execute<{
    id: string;
    action: string;
    subject_id: string;
  }>(sql`
    select id::text as id, action, subject_id
    from audit_logs
    where organization_id = ${orgId}
    order by created_at desc
    limit 20
  `);

  return Array.from(rows).map((row) => ({
    id: row.id,
    action: row.action,
    subjectId: row.subject_id,
  }));
};

export type DeploymentEnv = {
  environment: string;
  commitSha: string;
  buildSource: string;
};

// The deployment-environment + build-source indicators read Vercel's runtime env
// only; absent locally → a `development`/`local` fallback (never blank/undefined).
export const deploymentEnv = (): DeploymentEnv => {
  const environment = process.env.VERCEL_ENV ?? 'development';
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? '—';
  const buildSource = process.env.VERCEL_GIT_COMMIT_SHA ? 'vercel' : 'local';
  return { environment, commitSha, buildSource };
};

export type SwitchableOrg = { id: string; name: string };
export type SeededUser = { id: string; name: string; role: string };

type InspectorContext = {
  userId: string;
  orgId: string;
  orgName: string;
  role: string;
  orgs: SwitchableOrg[];
  members: SeededUser[];
};

const isDev = process.env.NODE_ENV !== 'production';

// The acting identity the inspector renders for. In production this is exactly the
// session identity. In development, an `inspector-acting-user` cookie naming a
// seeded user swaps the resolved identity/org/role — so the switcher can show each
// role without a real sign-in dance. The override lives HERE, never in
// requireOrgUser, so the privileged actions still resolve from the real session.
export const getInspectorContext = cache(
  async (): Promise<InspectorContext> => {
    const session = await requireOrgUser();
    let userId = session.user.id;
    let orgId = session.orgId;
    let role: string = session.role;

    if (isDev) {
      const jar = await cookies();
      const actingUserId = jar.get(ACTING_USER_COOKIE)?.value;
      if (actingUserId) {
        const membership = await db.query.member.findFirst({
          where: eq(member.userId, actingUserId),
        });
        if (membership) {
          userId = actingUserId;
          orgId = membership.organizationId;
          role = membership.role;
        }
      }
    }

    const org = await db.query.organization.findFirst({
      where: eq(organization.id, orgId),
    });

    const memberships = await db.query.member.findMany({
      where: eq(member.userId, userId),
      with: { organization: true },
    });
    const orgs = memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
    }));

    const orgMembers = await db.query.member.findMany({
      where: eq(member.organizationId, orgId),
      with: { user: true },
    });
    const members = orgMembers.map((m) => ({
      id: m.userId,
      name: m.user?.name ?? m.userId,
      role: m.role,
    }));

    return {
      userId,
      orgId,
      orgName: org?.name ?? 'No active organization',
      role,
      orgs,
      members,
    };
  },
);
