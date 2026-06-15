import { pathToFileURL } from 'node:url';

import { hashPassword } from 'better-auth/crypto';
import { reset } from 'drizzle-seed';

import { dbUnpooled } from '@/db/index';
import { emailSuppressions } from '@/db/schema';
import { account, session, user } from '@/db/schema/auth';

// The deterministic multi-tenant seed. Runs under tsx (CLI) and via the inspector's
// resetAndReseedAction. It imports better-auth/crypto's hashPassword (a server-only-
// free util) — never @/lib/auth, whose server-only import throws outside Next — so
// the seeded credential accounts are sign-in-able with the same scrypt format the
// app verifies.
//
// TODO(L2) — once the organization plugin has regenerated schema/auth.ts with
// organization/member/invitation (L2) and audit.ts defines auditLogs (L3), extend
// this seed to insert 2 orgs (Acme, Globex), 4 members (Alice owner / Bob admin /
// Carol member of Acme, Dave owner of Globex), one pending invitation in Acme with a
// fixed raw token + tokenHash + HMAC sig (print the canonical accept URL), and one
// fixture member.role-changed audit row so the inspector's tail is non-empty at first
// paint. Add `organization`, `member`, `invitation`, and `auditLogs` to the reset()
// set, and INVITATION_SIGNING_SECRET to env. All ids stay fixed so the screenshotter
// can target rows by id.

const SEED_PASSWORD = 'inspector-password-12';
const NOW = new Date('2026-01-01T00:00:00.000Z');

const USERS = [
  { id: 'user_alice', name: 'Alice', email: 'alice@acme.test' },
  { id: 'user_bob', name: 'Bob', email: 'bob@acme.test' },
  { id: 'user_carol', name: 'Carol', email: 'carol@acme.test' },
  { id: 'user_dave', name: 'Dave', email: 'dave@globex.test' },
] as const;

export const runSeed = async (): Promise<void> => {
  await reset(dbUnpooled, { emailSuppressions, user, session, account });

  const passwordHash = await hashPassword(SEED_PASSWORD);

  await dbUnpooled.insert(user).values(
    USERS.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    })),
  );

  await dbUnpooled.insert(account).values(
    USERS.map((u) => ({
      id: `account_${u.id}`,
      accountId: u.id,
      providerId: 'credential',
      userId: u.id,
      password: passwordHash,
      createdAt: NOW,
      updatedAt: NOW,
    })),
  );
};

// Run as a CLI: pathToFileURL normalizes the entry path so the guard fires even
// when the project path contains a space (import.meta.url percent-encodes it
// while process.argv[1] keeps it literal — a naive compare would silently skip).
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  runSeed()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
