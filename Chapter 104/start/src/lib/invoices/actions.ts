'use server';

import { revalidatePath, revalidateTag, updateTag } from 'next/cache';
import { z } from 'zod';
import { type AuthedCtx, authedAction } from '@/lib/authed-action';
import { logCacheInvalidation } from '@/lib/cache/log';
import { invoiceTags } from '@/lib/cache/tags';
import { conflict, err, ok, type Result } from '@/lib/result';
import { findInvoice, misuseFlag, pushAudit } from '@/server/store';
import { type Invoice, roleAtLeast } from '@/server/types';

const STATUS_VALUES = ['draft', 'sent', 'paid', 'overdue'] as const;

const CONFLICT_MESSAGE = 'This invoice changed elsewhere — refresh to retry.';

// The minimum complete invalidation set for an invoice mutation: the row moved
// in/out of the list, its record display changed, and the totals shifted, so
// list + record + summary all go stale. `updateTag` (read-your-writes — a
// specific user sits on the redirect) is Server-Action-only and is called only
// through the `tags.ts` helpers, never a raw string. `logCacheInvalidation`
// runs AFTER each `updateTag` returns so a throwing invalidation never leaves a
// log row claiming success.
const invalidateInvoice = (orgId: string, id: string): void => {
  const listTag = invoiceTags.list(orgId);
  updateTag(listTag);
  logCacheInvalidation(listTag, 'action');

  const recordTag = invoiceTags.record(orgId, id);
  updateTag(recordTag);
  logCacheInvalidation(recordTag, 'action');

  const summaryTag = invoiceTags.summary(orgId);
  updateTag(summaryTag);
  logCacheInvalidation(summaryTag, 'action');
};

// The `version` precondition is the optimistic-concurrency guard. FormData is
// strings, so coerce; `overwrite` is the admin-only escape hatch (defaults off).
const updateInvoiceSchema = z.strictObject({
  id: z.string(),
  customerName: z.string().min(1),
  status: z.enum(STATUS_VALUES),
  total: z.string().min(1),
  version: z.coerce.number().int(),
  overwrite: z.coerce.boolean().default(false),
});

export const updateInvoice = authedAction(
  'member',
  updateInvoiceSchema,
  async (input, ctx): Promise<Result<Invoice>> => {
    const row = findInvoice(ctx.orgId, input.id);
    if (!row || row.deletedAt !== null) {
      return err('not_found', 'Invoice not found.');
    }

    // Overwrite skips the version precondition, so it is admin-only — the RBAC
    // gate lives HERE, not only behind the hidden UI control. A member who
    // forges `overwrite=true` is refused at the action.
    if (input.overwrite && !roleAtLeast(ctx.role, 'admin')) {
      return err('forbidden', 'Only an admin can overwrite a conflict.');
    }

    // The UPDATE applies only when the row the client last saw still matches
    // (tenancy + `deletedAt IS NULL` already hold above). A stale tab that lost
    // the race gets an honest 409 carrying the row the server holds now — one
    // round trip, no client refetch — never a silent clobber.
    if (!input.overwrite && row.version !== input.version) {
      return conflict(CONFLICT_MESSAGE, row);
    }

    row.customerName = input.customerName;
    row.status = input.status;
    row.total = input.total;
    row.version += 1;

    pushAudit({
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: 'invoice.update',
      subjectId: row.id,
    });

    // After commit, before redirect: fan the three tags out with `updateTag`
    // (read-your-writes — a specific user sits on the redirect). The row moved
    // in/out of the list, its record display changed, and the totals shifted, so
    // list + record + summary is the minimum complete set. `updateTag` is
    // Server-Action-only and is called only through the `tags.ts` helpers.
    const listTag = invoiceTags.list(ctx.orgId);
    if (misuseFlag.misuseRevalidateFromAction) {
      // Deliberate failure-mode demo. Production code NEVER reads a flag like
      // this — it exists only as the teaching surface for the
      // read-your-writes-vs-eventual distinction. Routing the LIST tag through
      // `revalidateTag(tag, 'max')` (the eventual primitive) where `updateTag`
      // belongs is the misuse: cross-process this leaves the submitting render
      // stale (the chapter-074 reality), and the in-app signal is the logged
      // `action`-sourced `revalidateTag` list row. Record + summary stay correct.
      revalidateTag(listTag, 'max');
      logCacheInvalidation(listTag, 'action');
    } else {
      updateTag(listTag);
      logCacheInvalidation(listTag, 'action');
    }

    const recordTag = invoiceTags.record(ctx.orgId, row.id);
    updateTag(recordTag);
    logCacheInvalidation(recordTag, 'action');

    const summaryTag = invoiceTags.summary(ctx.orgId);
    updateTag(summaryTag);
    logCacheInvalidation(summaryTag, 'action');

    revalidatePath('/invoices');
    return ok(row);
  },
);

const lifecycle = z.strictObject({
  id: z.string(),
  version: z.coerce.number().int(),
});

// Each lifecycle write is one atomic step — the store mutation and the audit
// push happen together (in real Postgres this is a single `db.transaction`). The
// `id`+`version` precondition is the optimistic-concurrency guard: a stale tab
// that lost the race gets the honest conflict carrying the row the server holds
// now, never a silent clobber.

const archive = async (
  input: z.infer<typeof lifecycle>,
  ctx: AuthedCtx,
): Promise<Result<Invoice>> => {
  const row = findInvoice(ctx.orgId, input.id);
  if (!row) {
    return err('not_found', 'Invoice not found.');
  }
  if (
    row.version !== input.version ||
    row.archivedAt !== null ||
    row.deletedAt !== null
  ) {
    return conflict(CONFLICT_MESSAGE, row);
  }

  row.archivedAt = new Date().toISOString();
  row.version += 1;
  pushAudit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'invoice.archive',
    subjectId: row.id,
  });

  // After commit, before redirect: fan list + record + summary out with
  // `updateTag` (read-your-writes — the user is on the redirect). Log after each
  // call returns so a throwing invalidation never leaves a success row.
  invalidateInvoice(ctx.orgId, row.id);

  revalidatePath('/invoices');
  return ok(row);
};

// Restore clears whichever lifecycle flag is set (the admin path may restore a
// soft-deleted row); restoring an already-live row is itself a conflict.
const restore = async (
  input: z.infer<typeof lifecycle>,
  ctx: AuthedCtx,
): Promise<Result<Invoice>> => {
  const row = findInvoice(ctx.orgId, input.id);
  if (!row) {
    return err('not_found', 'Invoice not found.');
  }
  if (
    row.version !== input.version ||
    (row.archivedAt === null && row.deletedAt === null)
  ) {
    return conflict(CONFLICT_MESSAGE, row);
  }

  row.archivedAt = null;
  row.deletedAt = null;
  row.version += 1;
  pushAudit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'invoice.restore',
    subjectId: row.id,
  });

  // After commit, before redirect: fan list + record + summary out with
  // `updateTag` (read-your-writes — the user is on the redirect). Log after each
  // call returns so a throwing invalidation never leaves a success row.
  invalidateInvoice(ctx.orgId, row.id);

  revalidatePath('/invoices');
  return ok(row);
};

const softDelete = async (
  input: z.infer<typeof lifecycle>,
  ctx: AuthedCtx,
): Promise<Result<Invoice>> => {
  const row = findInvoice(ctx.orgId, input.id);
  if (!row) {
    return err('not_found', 'Invoice not found.');
  }
  if (row.version !== input.version || row.deletedAt !== null) {
    return conflict(CONFLICT_MESSAGE, row);
  }

  row.deletedAt = new Date().toISOString();
  row.version += 1;
  pushAudit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'invoice.delete',
    subjectId: row.id,
  });

  // After commit, before redirect: fan list + record + summary out with
  // `updateTag` (read-your-writes — the user is on the redirect). Log after each
  // call returns so a throwing invalidation never leaves a success row.
  invalidateInvoice(ctx.orgId, row.id);

  revalidatePath('/invoices');
  return ok(row);
};

export const archiveInvoice = authedAction('member', lifecycle, archive);
export const restoreInvoice = authedAction('member', lifecycle, restore);
// Soft-delete is admin-gated at the action — the RBAC gate lives here, not only
// in the UI (hiding the menu item is cosmetic on top of this).
export const softDeleteInvoice = authedAction('admin', lifecycle, softDelete);
