import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as auditSchema from '@/db/audit';
import * as suppressionsSchema from '@/db/schema';
import * as authSchema from '@/db/schema/auth';

// The integration test DB handle. Memoized and LAZY: the postgres-js connection is
// opened on the first getTestDb() call inside a test, never at module load (so importing
// the harness has no side effects). Connects to DATABASE_URL_TEST (the throwaway
// `saas_int_test` Postgres) with the full SUT schema + snake_case casing, mirroring the
// production `@/db` client exactly so the route's queries resolve the same tables.

type TestDb = ReturnType<typeof create>;

const create = () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error('DATABASE_URL_TEST is not set (load .env.test first)');
  }
  const client = postgres(url);
  return drizzle(client, {
    schema: { ...suppressionsSchema, ...authSchema, ...auditSchema },
    casing: 'snake_case',
  });
};

let cached: TestDb | undefined;

export const getTestDb = (): TestDb => {
  if (!cached) {
    cached = create();
  }
  return cached;
};
