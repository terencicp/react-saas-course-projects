import 'server-only';

import type { ChannelFn } from '../types';

// TODO(L3) — sendEmailChannel: getUserEmail (null → RECIPIENT_NOT_FOUND), render template, sendEmail with deterministic idempotencyKey; no unsubscribe header
export const sendEmailChannel: ChannelFn = () => Promise.resolve();
