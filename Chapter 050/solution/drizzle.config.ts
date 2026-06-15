import { defineConfig } from 'drizzle-kit';

// Drizzle Kit runs outside the app bundle, so it reads process.env directly
// (loaded via dotenv-cli in the db:* scripts) rather than the app's env module.
// It uses the unpooled URL — locally identical to DATABASE_URL; the rule carries
// forward to a serverless host where migrations want the direct connection.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED!,
  },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
