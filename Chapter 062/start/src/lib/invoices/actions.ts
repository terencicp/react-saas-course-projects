'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { type AuthedCtx, authedAction } from '@/lib/authed-action';
import { err, ok, type Result } from '@/lib/result';
import { findInvoice, pushAudit } from '@/server/store';
import type { Invoice } from '@/server/types';

const STATUS_VALUES = ['draft', 'sent', 'paid', 'overdue'] as const;

// TODO(L5) — add version precondition + conflict branch + overwrite.
//
// This is the chapter-047 baseline: it applies the edit unconditionally, so two
// tabs editing the same row silently overwrite each other. The hidden `version`
// round-trips in the form but is ignored here. The student adds the `version`
// precondition (apply only when `row.version === input.version`), returns an
// honest `conflict(message, current)` on mismatch, and an admin-only `overwrite`
// escape hatch.
const updateInvoiceSchema = z.strictObject({
  id: z.string(),
  customerName: z.string().min(1),
  status: z.enum(STATUS_VALUES),
  total: z.string().min(1),
  version: z.coerce.number().int(),
});

export const updateInvoice = authedAction(
  'member',
  updateInvoiceSchema,
  async (input, ctx): Promise<Result<Invoice>> => {
    const row = findInvoice(ctx.orgId, input.id);
    if (!row || row.deletedAt !== null) {
      return err('not_found', 'Invoice not found.');
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

    revalidatePath('/invoices');
    return ok(row);
  },
);

const lifecycle = z.strictObject({
  id: z.string(),
  version: z.coerce.number().int(),
});

// TODO(L4) — implement archive: find the row scoped to the org, refuse with a
// conflict if `version` mismatches or it is already archived/deleted, set
// `archivedAt`, bump `version`, push an audit row, and revalidate.
const archive = async (
  _input: z.infer<typeof lifecycle>,
  _ctx: AuthedCtx,
): Promise<Result<Invoice>> => err('internal', 'Not implemented');

// TODO(L4) — implement restore: clear whichever of archivedAt/deletedAt is set
// (the admin path may restore a soft-deleted row), bump `version`, push an audit
// row, and revalidate.
const restore = async (
  _input: z.infer<typeof lifecycle>,
  _ctx: AuthedCtx,
): Promise<Result<Invoice>> => err('internal', 'Not implemented');

// TODO(L4) — implement soft-delete: set `deletedAt`, bump `version`, push an
// audit row, and revalidate. This is admin-gated at the action below.
const softDelete = async (
  _input: z.infer<typeof lifecycle>,
  _ctx: AuthedCtx,
): Promise<Result<Invoice>> => err('internal', 'Not implemented');

export const archiveInvoice = authedAction('member', lifecycle, archive);
export const restoreInvoice = authedAction('member', lifecycle, restore);
// Soft-delete is admin-gated at the action — the RBAC gate lives here, not only
// in the UI (hiding the menu item is cosmetic on top of this).
export const softDeleteInvoice = authedAction('admin', lifecycle, softDelete);
