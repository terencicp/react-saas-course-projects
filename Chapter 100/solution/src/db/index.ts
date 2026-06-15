import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as auditSchema from '@/db/audit';
import * as relationsSchema from '@/db/relations';
import * as invoicesSchema from '@/db/schema';
import * as authSchema from '@/db/schema/auth';
import { env } from '@/env';

// postgres-js is the driver that reaches a vanilla (Docker) Postgres; the Neon
// serverless driver speaks HTTP/WebSocket only and cannot. casing lives on the
// client, set once — TS property names stay camelCase, columns map to snake_case.
const client = postgres(env.DATABASE_URL);

// The client holds the union of the invoices table, the CLI-generated auth +
// organization tables (user/session/account/verification/organization/member/
// invitation), the hand-authored audit_logs, and the relations so every app
// query — including db.query.invoices / db.query.auditLogs — resolves its table.
export const db = drizzle(client, {
  schema: {
    ...invoicesSchema,
    ...authSchema,
    ...auditSchema,
    ...relationsSchema,
  },
  casing: 'snake_case',
});

// The pooled/unpooled split is a no-op locally; this alias exists so seed/migrate/
// backfill code can read `dbUnpooled` per the convention Unit 20 makes real with
// Neon (long-running scripts want the direct connection, not the pooler).
export const dbUnpooled = db;

// The transaction handle drizzle hands the db.transaction callback. withTenant and
// logAudit type their first arg as this so off-transaction audit writes don't
// typecheck (logAudit refuses a bare `db`).
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
