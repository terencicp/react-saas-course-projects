import 'server-only';

import { and, eq, type SQL, sql } from 'drizzle-orm';
import type { PgInsertValue, PgUpdateSetSource } from 'drizzle-orm/pg-core';

import type { Transaction } from '@/db';
import { db } from '@/db';
import { exports, invoices } from '@/db/schema';
import { invitation, member } from '@/db/schema/auth';

// The audit-bearing transaction: set_config('app.org_id', orgId, true) is
// transaction-local (the SET LOCAL equivalent that takes a bind parameter) — never
// plain SET, which would leak the setting onto the pooled connection. The
// audit_logs org-isolation policy reads current_setting('app.org_id', true), so a
// tx without this would have its audit INSERT refused by the policy.
export const withTenant = async <T>(
  orgId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });

// The org-owned tables this project scopes. The registry is the single source of
// truth: the runtime backstop for the write methods and the type source for the
// query surface, so tenantDb(orgId).query.user is a type error (user is a global
// table, never tenant-scoped here).
const TENANT_TABLES = { member, invitation, invoices, exports } as const;

type TenantTable = (typeof TENANT_TABLES)[keyof typeof TENANT_TABLES];

// App-layer tenant scoping only — this facade does NOT set app.org_id. The
// audit-bearing write uses the separate withTenant. The org predicate is always the
// OUTER and so a caller's or(...) becomes a contradiction, not an escape hatch. There
// is no .raw / allOrgs bypass: the only unscoped path is the separately-imported db,
// reserved for scripts. The read wrappers forward the original method type via a cast
// so callers keep the full generic config → BuildQueryResult inference (a naive
// wrapper typed Promise<unknown[]> collapses the with-expansion and joined relations
// stop resolving).
export const tenantDb = (orgId: string) => ({
  query: {
    member: {
      findMany: ((config?: { where?: SQL }) =>
        db.query.member.findMany({
          ...config,
          where: and(eq(member.organizationId, orgId), config?.where),
        })) as typeof db.query.member.findMany,
      findFirst: ((config?: { where?: SQL }) =>
        db.query.member.findFirst({
          ...config,
          where: and(eq(member.organizationId, orgId), config?.where),
        })) as typeof db.query.member.findFirst,
    },
    invitation: {
      findMany: ((config?: { where?: SQL }) =>
        db.query.invitation.findMany({
          ...config,
          where: and(eq(invitation.organizationId, orgId), config?.where),
        })) as typeof db.query.invitation.findMany,
      findFirst: ((config?: { where?: SQL }) =>
        db.query.invitation.findFirst({
          ...config,
          where: and(eq(invitation.organizationId, orgId), config?.where),
        })) as typeof db.query.invitation.findFirst,
    },
    // The invoices read the export pages over. The org predicate is the OUTER `and`
    // so a caller's own `where` (the cursor predicate) can never widen past the
    // tenant — the task re-derives tenancy here from its payload organizationId,
    // since requireOrgUser() does not exist inside a Trigger.dev run.
    invoices: {
      findMany: ((config?: { where?: SQL }) =>
        db.query.invoices.findMany({
          ...config,
          where: and(eq(invoices.organizationId, orgId), config?.where),
        })) as typeof db.query.invoices.findMany,
      findFirst: ((config?: { where?: SQL }) =>
        db.query.invoices.findFirst({
          ...config,
          where: and(eq(invoices.organizationId, orgId), config?.where),
        })) as typeof db.query.invoices.findFirst,
    },
    // The app-side export rows: the run panel reads the most-recent one; the task
    // body closes the matching row to `completed` in its tenant transaction.
    exports: {
      findMany: ((config?: { where?: SQL }) =>
        db.query.exports.findMany({
          ...config,
          where: and(eq(exports.organizationId, orgId), config?.where),
        })) as typeof db.query.exports.findMany,
      findFirst: ((config?: { where?: SQL }) =>
        db.query.exports.findFirst({
          ...config,
          where: and(eq(exports.organizationId, orgId), config?.where),
        })) as typeof db.query.exports.findFirst,
    },
  },
  insert: <T extends TenantTable>(table: T) => {
    const builder = db.insert(table);
    return {
      values: (value: Omit<T['$inferInsert'], 'organizationId'>) => {
        const supplied = (value as { organizationId?: string }).organizationId;
        if (supplied !== undefined && supplied !== orgId) {
          throw new Error(
            'tenantDb insert: organizationId may not be overridden',
          );
        }
        return builder.values({
          ...value,
          organizationId: orgId,
        } as PgInsertValue<T>);
      },
    };
  },
  update: <T extends TenantTable>(table: T) => {
    const builder = db.update(table);
    return {
      set: (value: PgUpdateSetSource<T>) => ({
        where: (where?: SQL) =>
          builder.set(value).where(and(eq(table.organizationId, orgId), where)),
      }),
    };
  },
  delete: <T extends TenantTable>(table: T) => ({
    where: (where?: SQL) =>
      db.delete(table).where(and(eq(table.organizationId, orgId), where)),
  }),
  // The audit-bearing transaction, scoped to this org. Delegates to withTenant so
  // set_config('app.org_id', orgId, true) is set transaction-local — the audit_logs
  // org-isolation policy reads it, so a co-transacted logAudit INSERT passes. The
  // task body's closing step (update the exports row to `completed` + write the
  // export.invoices.completed audit row) runs inside one of these.
  transaction: <T>(fn: (tx: Transaction) => Promise<T>): Promise<T> =>
    withTenant(orgId, fn),
});
