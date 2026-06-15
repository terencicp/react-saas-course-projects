import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { reset } from 'drizzle-seed';

import { dbUnpooled } from '@/db/index';
import { emailSuppressions, rateLimitLog } from '@/db/schema';
import { account, user } from '@/db/schema/auth';

// Deterministic verified accounts so the inspector's spam runs are reproducible
// across boots. The seed does NOT import `@/lib/auth`: that module is `server-only`,
// which `tsx` refuses ("cannot be imported from a Client Component module"), breaking
// `pnpm db:seed`. Instead we mint each account the way Better Auth does on sign-up —
// a `user` row plus a `credential` `account` row carrying the scrypt password hash
// from `better-auth/crypto` (the same hasher Better Auth verifies against), so the
// seeded users sign in normally. `emailVerified` is set directly (requireEmailVerification
// is on, so a sign-up would leave it false).
//
// - alice@example.com / bob@example.com — verified sign-in targets (known password).
// - eve@example.com — the password-reset spam target.
const PASSWORD = 'correct-horse-staple';

const SEED_USERS = [
  { name: 'Alice', email: 'alice@example.com' },
  { name: 'Bob', email: 'bob@example.com' },
  { name: 'Eve', email: 'eve@example.com' },
] as const;

export const runSeed = async (): Promise<void> => {
  // Clear the project's own tables; the auth tables are re-created idempotently below.
  await reset(dbUnpooled, { emailSuppressions, rateLimitLog });

  const passwordHash = await hashPassword(PASSWORD);

  for (const { name, email } of SEED_USERS) {
    const userId = randomUUID();

    // Idempotent: drop any prior seed of this email so re-runs don't collide on the
    // unique email constraint (the account FK cascades on user delete).
    await dbUnpooled.delete(user).where(eq(user.email, email));

    await dbUnpooled.insert(user).values({
      id: userId,
      name,
      email,
      emailVerified: true,
    });

    // Better Auth keys credential accounts by providerId 'credential' with accountId
    // = the user id; the password column holds the scrypt hash it verifies on sign-in.
    await dbUnpooled.insert(account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: passwordHash,
    });
  }
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
