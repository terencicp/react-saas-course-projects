import { defineConfig } from 'drizzle-kit';

// Drizzle Kit runs outside the app bundle, so it reads process.env directly
// (loaded via dotenv-cli in the db:* scripts) rather than the app's env module.
// It uses the unpooled URL — locally identical to DATABASE_URL; the rule carries
// forward to a serverless host where migrations want the direct connection.
export default defineConfig({
  dialect: 'postgresql',
  // Two-file schema: the pre-auth tables (schema.ts) plus the CLI-generated auth
  // tables (schema/auth.ts). The array form lets drizzle-kit see every table, so
  // S1's `add_auth_tables` migration picks up user/session/account/verification;
  // a single-file `schema` would leave that migration empty. It tolerates the
  // empty `auth.ts` stub in the scaffold/start state (the init migration then
  // holds only email_suppressions).
  schema: ['./src/db/schema.ts', './src/db/schema/auth.ts'],
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED!,
  },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
