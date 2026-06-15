import 'server-only';

import type { DispatchResult, NotificationEvent } from './types';

// TODO(L2) — registry lookup (throw REGISTRY_MISS), per-recipient dedup, per-channel try/catch, DispatchResult counts; TODO(L3) — batched prefs read + resolveChannels + render-once + channelFns fan-out
export const dispatch = async (
  _event: NotificationEvent,
): Promise<DispatchResult> => {
  throw new Error('dispatch not implemented');
};
