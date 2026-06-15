import 'server-only';

import type { Transaction } from '@/db';
import { processedEvents } from '@/db/schema';

// The idempotency claim (carried from 063 L2). Insert a (provider, eventId) row;
// onConflictDoNothing on the unique pair means a replay inserts nothing and
// .returning() comes back empty. `true` = freshly claimed (proceed to mutate),
// `false` = duplicate (the caller returns 200 with { duplicate: true } — never a
// 4xx/5xx, which would tell the provider to retry forever).
//
// First arg is the Transaction handle, never the bare db: the claim and the
// mutation must share one transaction so a crash mid-handler rolls back both.
export const claimEvent = async (
  tx: Transaction,
  provider: string,
  eventId: string,
  eventType: string,
): Promise<boolean> => {
  const claimed = await tx
    .insert(processedEvents)
    .values({ provider, eventId, eventType })
    .onConflictDoNothing({
      target: [processedEvents.provider, processedEvents.eventId],
    })
    .returning({ id: processedEvents.id });

  return claimed.length > 0;
};
