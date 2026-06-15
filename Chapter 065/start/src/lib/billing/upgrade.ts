'use server';

import { z } from 'zod';

import { authedAction } from '@/lib/auth/authed-action';
import { err, type Result } from '@/lib/result';

// 'use server' — the Checkout client island imports and calls this. Starts an upgrade
// by creating a Stripe Checkout Session and returns its hosted URL for a full browser
// navigation. The webhook, not this action, writes the entitlement.
//
// TODO(L5) — ensure-Customer (create on Stripe before the local UPDATE), resolve the
// Price by lookup_key, checkout.sessions.create with subscription_data.metadata
// .organization_id + trial + payment_method_collection:'always'; return ok({ url }).
export const upgrade = authedAction(
  'admin',
  z.strictObject({ planSlug: z.enum(['pro', 'team']) }),
  async (_input, _ctx): Promise<Result<{ url: string }>> =>
    err('internal', 'Not implemented'),
);
