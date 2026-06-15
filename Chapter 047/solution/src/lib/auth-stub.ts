import { eq } from 'drizzle-orm';

import { db } from '@/db/index';
import { organizations, users } from '@/db/schema';

// The auth carve-out — a fixed org+user resolved by natural key; Ch 057 replaces
// this with `authedAction`. Reaching for `cookies()` here only creates code
// Unit 9 rewrites.
//
// The seed assigns PKs via `uuidv7()`, so ids differ across seeds — resolve them
// by a stable natural key (org slug + user email) at call time instead of
// hardcoding a UUID. Async matches where Ch 057's `authedAction` lands; the
// actions already `await` it.
export const getActiveContext = async (): Promise<{
  organizationId: string;
  userId: string;
}> => {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, 'acme'))
    .limit(1);

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'ada@acme.test'))
    .limit(1);

  if (!org || !user) {
    throw new Error(
      'getActiveContext: seeded Acme org or owner user not found — run `pnpm db:seed`.',
    );
  }

  return { organizationId: org.id, userId: user.id };
};
