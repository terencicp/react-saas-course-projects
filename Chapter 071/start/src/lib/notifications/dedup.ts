import 'server-only';

import type { NotificationEvent } from './types';

// TODO(L2) — isDuplicate (select most-recent row in window), recordDedup (insert one row), computeDedupKey (join keyBy with ':')

type DedupArgs = {
  event: NotificationEvent;
  userId: string;
  payload: Record<string, unknown>;
};

export const isDuplicate = (_args: DedupArgs): Promise<boolean> =>
  Promise.resolve(false);

export const recordDedup = (_args: DedupArgs): Promise<void> =>
  Promise.resolve();
