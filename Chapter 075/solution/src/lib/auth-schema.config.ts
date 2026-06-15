import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { db } from '@/db';

// CLI-only generator config — the `auth:generate` target. It is a server-only-free
// mirror of lib/auth.ts: the CLI's jiti loader executes this whole import graph, and
// any `import 'server-only'` in it throws, so this file (and everything it reaches)
// stays server-only-free. It must never import @/lib/auth, @/lib/email, or
// @/lib/suppressions. The real auth instance lives in src/lib/auth.ts.
//
// Only the schema-shaping options are mirrored — the adapter `provider` and the
// `emailAndPassword` block — which yields the byte-identical four-table schema
// (user/session/account/verification); no plugin here adds tables.
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: { enabled: true },
});
