import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as tables from '@/db/schema';
import { env } from '@/env';

// postgres-js is the driver that reaches a vanilla (Docker) Postgres; the Neon
// serverless driver speaks HTTP/WebSocket only and cannot. casing lives on the
// client, set once — TS property names stay camelCase, columns map to snake_case.
const client = postgres(env.DATABASE_URL);

// No relation graph here: emailSuppressions, organizations, and users are each
// queried directly, so the schema object spreads only the tables (the
// `...relations` spread that wired db.query.<table> in 047 is gone).
export const db = drizzle(client, {
  schema: { ...tables },
  casing: 'snake_case',
});

// The pooled/unpooled split is a no-op locally; this alias exists so seed/migrate
// code can read `dbUnpooled` per the convention Unit 20 makes real with Neon.
export const dbUnpooled = db;
