'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { getInspectorContext } from '@/app/(protected)/inspector/_data';
import { ACTING_USER_COOKIE } from '@/app/(protected)/inspector/constants';
import { db } from '@/db';
import { auditLogs } from '@/db/audit';
import { exports } from '@/db/schema';
import { dayBucket } from '@/lib/exports/day-bucket';
import { err, ok, type Result } from '@/lib/result';

import { runSeed } from '../../../../scripts/seed';

const isProd = process.env.NODE_ENV === 'production';

// The deterministic figure driver. Writes an `exports` row DIRECTLY to a chosen
// state — no Trigger.dev call — so the run panel's figures (progress bar mid-run,
// completed panel) are reproducible in the render pipeline without a live worker. On
// `completed` it also writes a matching `export.invoices.completed` audit row,
// mirroring what the real task body writes in its closing transaction. Dev-only
// (gated NODE_ENV) — never a production primitive.
export type SimulateState = 'queued' | 'running' | 'completed';

export const simulateRun = async (
  _prev: Result<{ state: SimulateState }> | null,
  formData: FormData,
): Promise<Result<{ state: SimulateState }>> => {
  if (isProd) {
    return err('forbidden', 'Simulating runs is disabled in production.');
  }

  const state = String(formData.get('state') ?? '') as SimulateState;
  if (state !== 'queued' && state !== 'running' && state !== 'completed') {
    return err('validation', 'Pick a state to simulate.');
  }

  const { orgId, userId } = await getInspectorContext();
  const fakeRunId = `run_sim_${Date.now()}`;
  const downloadUrl = `https://example.com/exports/${fakeRunId}.csv`;

  // Each simulate writes a fresh row with a distinct synthetic day bucket so the
  // figure is independent of any prior simulate that day — the dedup unique index is
  // on the real dayBucket; the synthetic suffix avoids colliding with it.
  const bucket = `${dayBucket()}-sim-${Date.now()}`;

  if (state === 'queued') {
    await db.insert(exports).values({
      organizationId: orgId,
      requestedBy: userId,
      status: 'queued',
      dayBucket: bucket,
      runId: fakeRunId,
    });
  } else if (state === 'running') {
    await db.insert(exports).values({
      organizationId: orgId,
      requestedBy: userId,
      status: 'running',
      dayBucket: bucket,
      runId: fakeRunId,
      pagesDone: 3,
      pagesTotal: 7,
    });
  } else {
    await db.insert(exports).values({
      organizationId: orgId,
      requestedBy: userId,
      status: 'completed',
      dayBucket: bucket,
      runId: fakeRunId,
      pagesDone: 7,
      pagesTotal: 7,
      rowCount: 245,
      downloadUrl,
      completedAt: new Date(),
    });
    // The matching audit row, written the same way the seed writes its fixture (the
    // dev superuser bypasses RLS, so no withTenant tx is needed here).
    await db.insert(auditLogs).values({
      organizationId: orgId,
      actorUserId: null,
      action: 'export.invoices.completed',
      subjectType: 'export',
      subjectId: fakeRunId,
      payload: { rowCount: 245 },
    });
  }

  revalidatePath('/inspector');
  return ok({ state });
};

// Dev-only: clear the active org's exports + completion audit rows, then re-seed so
// the inspector can be reset between experiments. Gated NODE_ENV.
export const resetExports = async (): Promise<Result<{ reset: true }>> => {
  if (isProd) {
    return err('forbidden', 'Resetting exports is disabled in production.');
  }

  const { orgId } = await getInspectorContext();
  await db.delete(exports).where(eq(exports.organizationId, orgId));
  await db
    .delete(auditLogs)
    .where(
      and(
        eq(auditLogs.organizationId, orgId),
        eq(auditLogs.action, 'export.invoices.completed'),
      ),
    );
  await runSeed();
  revalidatePath('/inspector');
  return ok({ reset: true });
};

// Dev-only: swap the acting user among the seeded set so the inspector can be viewed
// as each role without a real sign-in dance. Gated NODE_ENV.
export const switchIdentity = async (
  _prev: Result<{ userId: string }> | null,
  formData: FormData,
): Promise<Result<{ userId: string }>> => {
  if (isProd) {
    return err('forbidden', 'Identity switching is disabled in production.');
  }

  const userId = String(formData.get('userId') ?? '');
  if (!userId) {
    return err('validation', 'Pick a seeded user to act as.');
  }

  const jar = await cookies();
  jar.set(ACTING_USER_COOKIE, userId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });

  revalidatePath('/inspector');
  return ok({ userId });
};
