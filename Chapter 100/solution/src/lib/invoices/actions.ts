'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { db } from '@/db';
import { logAudit } from '@/db/audit-log';
import { invoices } from '@/db/schema';
import { withTenant } from '@/db/tenant';
import { authedAction } from '@/lib/auth/authed-action';
import { roleAtLeast } from '@/lib/auth/roles';
import type { InvoiceRow } from '@/lib/invoices/queries';
import { conflict, err, ok, type Result } from '@/lib/result';

const STATUS_VALUES = ['draft', 'sent', 'paid', 'overdue'] as const;

const CONFLICT_MESSAGE = 'This invoice changed elsewhere — refresh to retry.';

const rowToInvoice = (row: typeof invoices.$inferSelect): InvoiceRow => ({
  id: row.id,
  organizationId: row.organizationId,
  number: row.number,
  customerName: row.customerName,
  status: row.status,
  subtotal: row.subtotal,
  tax: row.tax,
  currency: row.currency,
  createdAt: row.createdAt,
  dueAt: row.dueAt,
  deletedAt: row.deletedAt,
  archivedAt: row.archivedAt,
  version: row.version,
});

// FormData is strings; money stays a string end to end (numeric maps to string at
// the Drizzle runtime). The form posts the subtotal + tax pair — the contract
// dropped the combined-amount write and the transitional legacy-amount fallback.
// The `version` precondition is the optimistic-concurrency guard; `overwrite` is
// the admin-only escape hatch.
const createInvoiceSchema = z.strictObject({
  number: z.string().min(1),
  customerName: z.string().min(1),
  status: z.enum(STATUS_VALUES).default('draft'),
  subtotal: z.string().min(1),
  tax: z.string().min(1),
  currency: z.string().min(1).default('USD'),
});

export const createInvoice = authedAction(
  'member',
  createInvoiceSchema,
  async (input, ctx): Promise<Result<InvoiceRow>> =>
    withTenant(ctx.orgId, async (tx) => {
      const [row] = await tx
        .insert(invoices)
        .values({
          organizationId: ctx.orgId,
          number: input.number,
          customerName: input.customerName,
          status: input.status,
          subtotal: input.subtotal,
          tax: input.tax,
          currency: input.currency,
        })
        .returning();

      if (!row) {
        return err('internal', 'Could not create the invoice.');
      }

      await logAudit(tx, {
        action: 'invoice.create',
        subjectType: 'invoice',
        subjectId: row.id,
      });

      revalidatePath('/invoices');
      return ok(rowToInvoice(row));
    }),
);

const updateInvoiceSchema = z.strictObject({
  id: z.string(),
  customerName: z.string().min(1),
  status: z.enum(STATUS_VALUES),
  subtotal: z.string().min(1),
  tax: z.string().min(1),
  version: z.coerce.number().int(),
  overwrite: z.coerce.boolean().default(false),
});

export const updateInvoice = authedAction(
  'member',
  updateInvoiceSchema,
  async (input, ctx): Promise<Result<InvoiceRow>> =>
    withTenant(ctx.orgId, async (tx) => {
      const [row] = await tx
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, ctx.orgId),
            eq(invoices.id, input.id),
          ),
        )
        .limit(1);

      if (!row || row.deletedAt !== null) {
        return err('not_found', 'Invoice not found.');
      }

      // Overwrite skips the version precondition, so it is admin-only — the RBAC
      // gate lives HERE, not only behind the hidden UI control.
      if (input.overwrite && !roleAtLeast(ctx.role, 'admin')) {
        return err('forbidden', 'Only an admin can overwrite a conflict.');
      }

      // The honest 409: a stale tab that lost the race gets the row the server
      // holds now, one round trip, never a silent clobber.
      if (!input.overwrite && row.version !== input.version) {
        return conflict(CONFLICT_MESSAGE, rowToInvoice(row));
      }

      const [updated] = await tx
        .update(invoices)
        .set({
          customerName: input.customerName,
          status: input.status,
          subtotal: input.subtotal,
          tax: input.tax,
          version: row.version + 1,
        })
        .where(
          and(
            eq(invoices.organizationId, ctx.orgId),
            eq(invoices.id, input.id),
          ),
        )
        .returning();

      if (!updated) {
        return err('internal', 'Could not update the invoice.');
      }

      await logAudit(tx, {
        action: 'invoice.update',
        subjectType: 'invoice',
        subjectId: updated.id,
      });

      revalidatePath('/invoices');
      return ok(rowToInvoice(updated));
    }),
);

// The lifecycle actions touch no money column, so the migration cadence leaves
// them unchanged. Each is one atomic step — the UPDATE and the audit row
// co-transact in one withTenant. The id+version precondition is the
// optimistic-concurrency guard.
const lifecycleSchema = z.strictObject({
  id: z.string(),
  version: z.coerce.number().int(),
});

type Lifecycle = z.infer<typeof lifecycleSchema>;

const loadOwned = async (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  orgId: string,
  id: string,
) => {
  const [row] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.organizationId, orgId), eq(invoices.id, id)))
    .limit(1);
  return row;
};

export const archiveInvoice = authedAction(
  'member',
  lifecycleSchema,
  async (input: Lifecycle, ctx): Promise<Result<InvoiceRow>> =>
    withTenant(ctx.orgId, async (tx) => {
      const row = await loadOwned(tx, ctx.orgId, input.id);
      if (!row) {
        return err('not_found', 'Invoice not found.');
      }
      if (
        row.version !== input.version ||
        row.archivedAt !== null ||
        row.deletedAt !== null
      ) {
        return conflict(CONFLICT_MESSAGE, rowToInvoice(row));
      }

      const [updated] = await tx
        .update(invoices)
        .set({ archivedAt: new Date(), version: row.version + 1 })
        .where(
          and(
            eq(invoices.organizationId, ctx.orgId),
            eq(invoices.id, input.id),
          ),
        )
        .returning();

      await logAudit(tx, {
        action: 'invoice.archive',
        subjectType: 'invoice',
        subjectId: input.id,
      });
      revalidatePath('/invoices');
      return ok(rowToInvoice(updated as typeof invoices.$inferSelect));
    }),
);

export const restoreInvoice = authedAction(
  'member',
  lifecycleSchema,
  async (input: Lifecycle, ctx): Promise<Result<InvoiceRow>> =>
    withTenant(ctx.orgId, async (tx) => {
      const row = await loadOwned(tx, ctx.orgId, input.id);
      if (!row) {
        return err('not_found', 'Invoice not found.');
      }
      if (
        row.version !== input.version ||
        (row.archivedAt === null && row.deletedAt === null)
      ) {
        return conflict(CONFLICT_MESSAGE, rowToInvoice(row));
      }

      const [updated] = await tx
        .update(invoices)
        .set({ archivedAt: null, deletedAt: null, version: row.version + 1 })
        .where(
          and(
            eq(invoices.organizationId, ctx.orgId),
            eq(invoices.id, input.id),
          ),
        )
        .returning();

      await logAudit(tx, {
        action: 'invoice.restore',
        subjectType: 'invoice',
        subjectId: input.id,
      });
      revalidatePath('/invoices');
      return ok(rowToInvoice(updated as typeof invoices.$inferSelect));
    }),
);

// Soft-delete is admin-gated at the action — the RBAC gate lives here, not only
// in the UI (hiding the menu item is cosmetic on top of this).
export const softDeleteInvoice = authedAction(
  'admin',
  lifecycleSchema,
  async (input: Lifecycle, ctx): Promise<Result<InvoiceRow>> =>
    withTenant(ctx.orgId, async (tx) => {
      const row = await loadOwned(tx, ctx.orgId, input.id);
      if (!row) {
        return err('not_found', 'Invoice not found.');
      }
      if (row.version !== input.version || row.deletedAt !== null) {
        return conflict(CONFLICT_MESSAGE, rowToInvoice(row));
      }

      const [updated] = await tx
        .update(invoices)
        .set({ deletedAt: new Date(), version: row.version + 1 })
        .where(
          and(
            eq(invoices.organizationId, ctx.orgId),
            eq(invoices.id, input.id),
          ),
        )
        .returning();

      await logAudit(tx, {
        action: 'invoice.delete',
        subjectType: 'invoice',
        subjectId: input.id,
      });
      revalidatePath('/invoices');
      return ok(rowToInvoice(updated as typeof invoices.$inferSelect));
    }),
);
