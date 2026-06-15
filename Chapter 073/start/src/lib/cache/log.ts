import 'server-only';

import { pushInvalidation } from '@/server/store';

// The single place every invalidation gets recorded for the inspector's log
// tail. Actions call it with `'action'`, the recompute job with `'job'`. Call it
// AFTER the real `updateTag`/`revalidateTag` returns — a throwing invalidation
// must not leave a log row claiming success. The student calls this; never edits
// it. In the DB-backed framing this is an INSERT into `cache_invalidation_log`.
export const logCacheInvalidation = (
  tag: string,
  source: 'action' | 'job',
): void => {
  pushInvalidation(tag, source);
};
