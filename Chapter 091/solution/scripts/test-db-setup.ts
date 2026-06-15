import { pathToFileURL } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Bring up the integration test database `saas_int_test`: CREATE it if absent (against
// the postgres-test maintenance DB), then run the production drizzle/ migrations against
// it. Idempotent — safe to run repeatedly. Reads DATABASE_URL_TEST (loaded via
// dotenv-cli -e .env.test in the db:test:setup script).

const TARGET_DB = 'saas_int_test';

// Connect to a maintenance DB to issue CREATE DATABASE (you cannot create a DB while
// connected to it). The service's default DB is saas_int_test itself, so use `postgres`.
const maintenanceUrl = (testUrl: string): string => {
  const u = new URL(testUrl);
  u.pathname = '/postgres';
  return u.toString();
};

const ensureDatabase = async (testUrl: string): Promise<void> => {
  const admin = postgres(maintenanceUrl(testUrl), { max: 1 });
  try {
    const rows = await admin`
      select 1 from pg_database where datname = ${TARGET_DB}
    `;
    if (rows.length === 0) {
      // Identifier is a fixed literal, not user input — safe to interpolate.
      await admin.unsafe(`create database ${TARGET_DB}`);
      console.info(`[test-db-setup] created database ${TARGET_DB}`);
    } else {
      console.info(`[test-db-setup] database ${TARGET_DB} already exists`);
    }
  } finally {
    await admin.end();
  }
};

export const run = async (): Promise<void> => {
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error(
      'DATABASE_URL_TEST is not set (run via dotenv -e .env.test)',
    );
  }
  await ensureDatabase(testUrl);

  const client = postgres(testUrl, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: './drizzle' });
  await client.end();
  console.info('[test-db-setup] migrations applied');
};

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  run()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
