import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as auditSchema from '@/db/audit';
import * as suppressionsSchema from '@/db/schema';
import * as authSchema from '@/db/schema/auth';
import { env } from '@/env';

// postgres-js is the driver that reaches a vanilla (Docker) Postgres; the Neon
// serverless driver speaks HTTP/WebSocket only and cannot. casing lives on the
// client, set once — TS property names stay camelCase, columns map to snake_case.
const client = postgres(env.DATABASE_URL);

// The client holds the union of the pre-auth tables (email_suppressions), the
// CLI-generated auth + organization tables (user/session/account/verification/
// organization/member/invitation), and the hand-authored audit_logs so every app
// query — including db.query.auditLogs — resolves its table.
export const db = drizzle(client, {
  schema: { ...suppressionsSchema, ...authSchema, ...auditSchema },
  casing: 'snake_case',
});

// The pooled/unpooled split is a no-op locally; this alias exists so seed/migrate
// code can read `dbUnpooled` per the convention Unit 20 makes real with Neon.
export const dbUnpooled = db;

// The transaction handle drizzle hands the db.transaction callback. withTenant and
// logAudit type their first arg as this so off-transaction audit writes don't
// typecheck (logAudit refuses a bare `db`).
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
