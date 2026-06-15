import 'server-only';

import type { ChannelFn } from '../types';

// TODO(L3) — writeInboxChannel: insert one notifications row from rendered.inbox, no joins
export const writeInboxChannel: ChannelFn = () => Promise.resolve();
