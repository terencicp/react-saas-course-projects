'use server';

import { z } from 'zod';

import { authedAction } from '@/lib/auth/authed-action';
import { err, type Result } from '@/lib/result';

// The fire-and-forget trigger boundary. `member` is the structural role pin for who
// may export. The inspector's Export island imports this; the button shows the error
// until L2 wires the real trigger.
//
// TODO(L2) — insert exports row (status queued, dayBucket), tasks.trigger export-invoices with concurrencyKey: orgId + idempotencyKeys.create([orgId,userId,dayBucket()],{scope:'global'}) + idempotencyKeyTTL 24h, update row runId, return ok({ runId })
export const startExport = authedAction(
  'member',
  z.strictObject({}),
  async (_input, _ctx): Promise<Result<{ runId: string }>> =>
    err('internal', 'Not implemented'),
);
