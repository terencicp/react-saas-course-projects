'use server';

import { redirect } from 'next/navigation';
import {
  archiveInvoice,
  restoreInvoice,
  softDeleteInvoice,
  updateInvoice,
} from '@/lib/invoices/actions';
import { recomputeOrgSummary } from '@/server/jobs/summary-recompute';
import { getSession } from '@/server/session';
import { findInvoice, misuseFlag } from '@/server/store';
import type { Invoice } from '@/server/types';

// Infra, NOT student-owned — identical in start/ and solution/. Its behavior
// changes only because the files it calls change (queries.ts, actions.ts,
// summary-recompute.ts). The inspector buttons post to these; each catches a
// thrown error, surfaces it into the result area, and redirects back to
// /inspector. The result string round-trips through the `?result=` query param,
// which the inspector page renders into `action-result`.

const RESULT_PARAM = 'result';

const backToInspector = (message: string): never => {
  redirect(`/inspector?${RESULT_PARAM}=${encodeURIComponent(message)}`);
};

// Pick a deterministic seeded row for the active org. Prefer inv-0001 (the seed
// always carries it for org-acme); fall back to no target for other orgs.
const pickTarget = async (): Promise<Invoice | null> => {
  const session = await getSession();
  return findInvoice(session.orgId, 'inv-0001') ?? null;
};

// Run the real `updateInvoice` flow with a small `total` delta on a deterministic
// row, so it exercises the action's invalidation fan-out (incl. the misuse branch
// the action reads internally). At scaffold the action commits + revalidatePaths
// but fires no updateTag (S2).
export const editOneInvoice = async (): Promise<void> => {
  let message: string;
  try {
    const row = await pickTarget();
    if (!row) {
      message = 'No seeded invoice to edit for this org.';
    } else {
      const nextTotal = (Number(row.total) + 1).toFixed(2);
      const formData = new FormData();
      formData.set('id', row.id);
      formData.set('customerName', row.customerName);
      formData.set('status', row.status);
      formData.set('total', nextTotal);
      formData.set('version', String(row.version));
      const result = await updateInvoice(null, formData);
      message = result.ok
        ? `Edited ${row.id}: total → ${nextTotal}`
        : `Edit refused: ${result.error.userMessage}`;
    }
  } catch (error) {
    message = error instanceof Error ? error.message : 'Edit failed.';
  }
  backToInspector(message);
};

export const archiveOneInvoice = async (): Promise<void> => {
  let message: string;
  try {
    const row = await pickTarget();
    if (!row) {
      message = 'No seeded invoice for this org.';
    } else {
      const formData = new FormData();
      formData.set('id', row.id);
      formData.set('version', String(row.version));
      const result = await archiveInvoice(null, formData);
      message = result.ok
        ? `Archived ${row.id}`
        : `Archive refused for ${row.id}`;
    }
  } catch (error) {
    message = error instanceof Error ? error.message : 'Archive failed.';
  }
  backToInspector(message);
};

export const restoreOneInvoice = async (): Promise<void> => {
  let message: string;
  try {
    const row = await pickTarget();
    if (!row) {
      message = 'No seeded invoice for this org.';
    } else {
      const formData = new FormData();
      formData.set('id', row.id);
      formData.set('version', String(row.version));
      const result = await restoreInvoice(null, formData);
      message = result.ok
        ? `Restored ${row.id}`
        : `Restore refused for ${row.id}`;
    }
  } catch (error) {
    message = error instanceof Error ? error.message : 'Restore failed.';
  }
  backToInspector(message);
};

export const deleteOneInvoice = async (): Promise<void> => {
  let message: string;
  try {
    const row = await pickTarget();
    if (!row) {
      message = 'No seeded invoice for this org.';
    } else {
      const formData = new FormData();
      formData.set('id', row.id);
      formData.set('version', String(row.version));
      const result = await softDeleteInvoice(null, formData);
      message = result.ok
        ? `Soft-deleted ${row.id}`
        : `Delete refused for ${row.id}`;
    }
  } catch (error) {
    message = error instanceof Error ? error.message : 'Delete failed.';
  }
  backToInspector(message);
};

// Always await the recompute job. It throws 'summary job not implemented' via the
// stub until S3 implements it — no edit to this file is needed when S3 lands.
export const runSummaryJob = async (): Promise<void> => {
  let message: string;
  try {
    const session = await getSession();
    const out = await recomputeOrgSummary({ orgId: session.orgId });
    message = `Summary recomputed: count ${out.totalCount}, amount ${out.totalAmount}`;
  } catch (error) {
    message = error instanceof Error ? error.message : 'Summary job failed.';
  }
  backToInspector(message);
};

// Flip the in-store misuse flag the `updateInvoice` action reads (S2). Production
// code never reads such a flag — this exists only as the teaching surface for the
// read-your-writes-vs-eventual distinction.
export const toggleMisuseRevalidate = async (): Promise<void> => {
  misuseFlag.misuseRevalidateFromAction =
    !misuseFlag.misuseRevalidateFromAction;
  redirect('/inspector');
};
