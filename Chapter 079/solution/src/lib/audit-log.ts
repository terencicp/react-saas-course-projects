import 'server-only';

import { pushAudit } from '@/server/store';

// A thin wrapper over the store's `pushAudit`. The wizard action calls this on
// the happy path to record a `customer.created` row. Kept separate from the
// store so the action depends on a small audit surface, not the whole store.
export const logAudit = (entry: {
  orgId: string;
  actorUserId: string;
  action: string;
  subjectId: string;
}): void => {
  pushAudit(entry);
};
