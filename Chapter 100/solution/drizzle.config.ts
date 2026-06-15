import { defineConfig } from 'drizzle-kit';

// Drizzle Kit runs outside the app bundle, so it reads process.env directly
// (loaded via dotenv-cli in the db:* scripts) rather than the app's env module.
// It uses the unpooled URL — locally identical to DATABASE_URL; the rule carries
// forward to a serverless host where migrations want the direct connection.
export default defineConfig({
  dialect: 'postgresql',
  // Three-file schema: the pre-auth tables (schema.ts), the CLI-generated auth +
  // organization tables (schema/auth.ts), and the hand-authored audit_logs
  // (audit.ts). The array form lets drizzle-kit see every table; without audit.ts
  // listed, `drizzle-kit generate` is blind to audit_logs and its migration comes
  // out empty. The marker-only audit.ts stub the scaffold ships is tolerated.
  schema: [
    './src/db/schema.ts',
    './src/db/schema/auth.ts',
    './src/db/audit.ts',
  ],
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? '',
  },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
