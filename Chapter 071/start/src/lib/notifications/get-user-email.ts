import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { user } from '@/db/schema/auth';

// Resolve a recipient's email from Better Auth's `user` table. Returns null when the
// user has no row (the email channel turns null into RECIPIENT_NOT_FOUND, which the
// dispatcher swallows per-channel).
export const getUserEmail = async (userId: string): Promise<string | null> => {
  const row = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { email: true },
  });
  return row?.email ?? null;
};
