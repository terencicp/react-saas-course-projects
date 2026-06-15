import { pathToFileURL } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { runSeedE2e } from './seed-e2e';

// Reset the Playwright database `saas_e2e` to a known state: CREATE it if absent, run
// the production migrations, then seed it (runSeedE2e). Idempotent. Reads
// DATABASE_URL_E2E (loaded via dotenv-cli -e .env.test in the db:e2e:reset script).

const TARGET_DB = 'saas_e2e';

const maintenanceUrl = (e2eUrl: string): string => {
  const u = new URL(e2eUrl);
  u.pathname = '/postgres';
  return u.toString();
};

const ensureDatabase = async (e2eUrl: string): Promise<void> => {
  const admin = postgres(maintenanceUrl(e2eUrl), { max: 1 });
  try {
    const rows = await admin`
      select 1 from pg_database where datname = ${TARGET_DB}
    `;
    if (rows.length === 0) {
      await admin.unsafe(`create database ${TARGET_DB}`);
      console.info(`[e2e-db-reset] created database ${TARGET_DB}`);
    } else {
      console.info(`[e2e-db-reset] database ${TARGET_DB} already exists`);
    }
  } finally {
    await admin.end();
  }
};

export const run = async (): Promise<void> => {
  const e2eUrl = process.env.DATABASE_URL_E2E;
  if (!e2eUrl) {
    throw new Error(
      'DATABASE_URL_E2E is not set (run via dotenv -e .env.test)',
    );
  }
  await ensureDatabase(e2eUrl);

  const client = postgres(e2eUrl, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: './drizzle' });
  await client.end();
  console.info('[e2e-db-reset] migrations applied');

  await runSeedE2e();
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
