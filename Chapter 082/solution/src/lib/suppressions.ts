import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/db/index';
import { emailSuppressions } from '@/db/schema';

// The suppression read lives only here and at the `sendEmail` wrapper that calls
// it; callers never re-check. `email` is normalized to match the unique index so
// the lookup and every seeded/webhook-written row always agree.
export const isSuppressed = async (
  email: string,
  opts: { kind: 'transactional' | 'marketing' },
): Promise<{ suppressed: boolean; reason?: string; bypassUntil?: Date }> => {
  const normalized = email.trim().toLowerCase();

  const [row] = await db
    .select()
    .from(emailSuppressions)
    .where(eq(emailSuppressions.email, normalized))
    .limit(1);

  if (!row) {
    return { suppressed: false };
  }

  if (row.bypassUntil && row.bypassUntil > new Date()) {
    return { suppressed: false, bypassUntil: row.bypassUntil };
  }

  if (row.reason === 'manual_unsubscribe' && opts.kind === 'transactional') {
    return { suppressed: false, reason: 'manual_unsubscribe' };
  }

  return { suppressed: true, reason: row.reason };
};
