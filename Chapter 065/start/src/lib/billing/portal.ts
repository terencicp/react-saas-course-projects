'use server';

import { z } from 'zod';

import { authedAction } from '@/lib/auth/authed-action';
import { err, type Result } from '@/lib/result';

// 'use server' — the Portal client island imports and calls this. Opens a Stripe
// Billing Portal session for the org's Customer and returns its URL. Plan changes and
// cancellation happen in the Portal, never via stripe.subscriptions.update from app code.
//
// TODO(L5) — openPortal: no Customer → err; else billingPortal.sessions.create with
// return_url; return ok({ url }).
export const openPortal = authedAction(
  'admin',
  z.strictObject({ returnPath: z.string().optional() }),
  async (_input, _ctx): Promise<Result<{ url: string }>> =>
    err('internal', 'Not implemented'),
);
