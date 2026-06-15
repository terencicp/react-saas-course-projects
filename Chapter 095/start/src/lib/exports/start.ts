'use server';

import { idempotencyKeys, tasks } from '@trigger.dev/sdk/v3';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { exports } from '@/db/schema';
import { authedAction } from '@/lib/auth/authed-action';
import { dayBucket } from '@/lib/exports/day-bucket';
import { err, ok, type Result } from '@/lib/result';

import type { exportInvoices } from '../../../trigger/export-invoices';

// The fire-and-forget trigger boundary. `member` is the structural role pin for who
// may export. The action inserts the queued `exports` row (the pre-trigger insert so
// the row exists for the daily-key dedup), fires `tasks.trigger` (fire-and-forget —
// blocking on an in-task wait from a Server Action would exceed maxDuration), updates
// the row's runId, and returns the handle id immediately. The in-task child waits
// live in the parent task body, never here.
//
// The insert-then-update around the trigger is a two-step write; a trigger failure
// after the insert leaves a rare orphan `queued` row. Production hardening would wrap
// the trigger in the transaction (accept the orphan on a true trigger failure); this
// project builds it simply.
//
// concurrencyKey: ctx.orgId is the per-org lane — sequential within an org, parallel
// across orgs (the queue's concurrencyLimit: 1 copies per key). The daily business
// key (idempotencyKeys.create([orgId, userId, dayBucket()], { scope: 'global' }) +
// idempotencyKeyTTL: '24h') short-circuits a same-day re-trigger to the existing run.
export const startExport = authedAction(
  'member',
  z.strictObject({}),
  async (_input, ctx): Promise<Result<{ runId: string }>> => {
    const bucket = dayBucket();

    const inserted = await ctx.db
      .insert(exports)
      .values({
        requestedBy: ctx.user.id,
        status: 'queued',
        dayBucket: bucket,
        runId: null,
      })
      .returning({ id: exports.id });
    const row = inserted[0];
    if (!row) {
      return err('internal', 'Could not record the export request.');
    }

    const handle = await tasks.trigger<typeof exportInvoices>(
      'export-invoices',
      { organizationId: ctx.orgId, requestedBy: ctx.user.id },
      {
        concurrencyKey: ctx.orgId,
        idempotencyKey: await idempotencyKeys.create(
          [ctx.orgId, ctx.user.id, bucket],
          { scope: 'global' },
        ),
        idempotencyKeyTTL: '24h',
        tags: [`org:${ctx.orgId}`],
      },
    );

    await ctx.db
      .update(exports)
      .set({ runId: handle.id })
      .where(eq(exports.id, row.id));

    revalidatePath('/inspector');
    return ok({ runId: handle.id });
  },
);
