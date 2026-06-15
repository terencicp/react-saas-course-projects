import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';

import { db } from '@/db';

// CLI-only generator config — the `auth:generate` target. It is a server-only-free
// mirror of lib/auth.ts: the CLI's jiti loader executes this whole import graph, and
// any `import 'server-only'` in it throws, so this file (and everything it reaches)
// stays server-only-free. It must never import @/lib/auth, @/lib/email, or
// @/lib/suppressions. The real auth instance lives in src/lib/auth.ts.
//
// Only the schema-shaping options are mirrored — the adapter `provider`, the
// `emailAndPassword` block, and the organization plugin's table shape (teams off +
// the invitation additionalFields) — so auth:generate emits the same
// organization/member/invitation tables, session.activeOrganizationId column, and
// invitation.tokenHash/acceptedAt columns. No runtime-only options here
// (no databaseHooks, no invitationExpiresIn).
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: { enabled: true },
  plugins: [
    organization({
      teams: { enabled: false },
      schema: {
        invitation: {
          additionalFields: {
            tokenHash: { type: 'string', required: true },
            acceptedAt: { type: 'date', required: false },
          },
        },
      },
    }),
  ],
});
