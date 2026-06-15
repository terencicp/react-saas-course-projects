import 'server-only';

import { db } from '@/db';
import { rateLimitLog } from '@/db/schema';

// The operator-honest log writer. `safeLimit` calls it on a Redis outage
// (`rate_limit_unavailable`); the action reject helper (`rateLimited`) calls it when
// a gate trips (`rate_limit_rejected`) with the honest gate + key. The user-facing
// message stays opaque — the gate + key land only here, never in the response.
//
// pino + AsyncLocalStorage + redaction is the production structured logger
// (named-not-built, Chapter 092); this is the project-local honest log the
// inspector's structured-log tail reads. The student calls it from `safeLimit` and
// `rateLimited`; never edits it.
export const logRateLimit = async (entry: {
  event: 'rate_limit_rejected' | 'rate_limit_unavailable';
  limiter: string;
  key: string;
  remaining?: number;
  reset?: number;
}): Promise<void> => {
  await db.insert(rateLimitLog).values({
    event: entry.event,
    limiter: entry.limiter,
    key: entry.key,
    remaining: entry.remaining ?? 0,
    reset: entry.reset ?? 0,
  });
};
