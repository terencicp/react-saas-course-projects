import 'server-only';

import type { ChannelName, NotifiableEvent } from './types';

// TODO(L3) — readPrefsForCategory (one batched IN query → Map), resolveChannels (?? true default-on, || criticalChannel override)

export const readPrefsForCategory = (
  _userIds: string[],
  _category: string,
): Promise<Map<string, Record<string, unknown> | undefined>> =>
  Promise.resolve(new Map());

// Stub: returns the registry channels unchanged (prefs go live in L3).
export const resolveChannels = (
  event: NotifiableEvent,
  _prefs: Record<string, unknown> | undefined,
): ChannelName[] => event.channels;
