'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { db } from '@/db/index';
import { invoiceLines, invoices } from '@/db/schema';
import { getActiveContext } from '@/lib/auth-stub';
import {
  createInvoiceInputSchema,
  deleteInvoiceInputSchema,
  updateInvoiceInputSchema,
} from '@/lib/invoices/mutation-schemas';
import { err, isUniqueViolation, ok, type Result } from '@/lib/result';

export const createInvoice = async (
  _prevState: Result<{ id: string }> | null,
  formData: FormData,
): Promise<Result<{ id: string }>> => {
  const parsed = createInvoiceInputSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    return err(
      'validation',
      'Check the highlighted fields.',
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  // remove before production — teaching aid only
  if (formData.get('_debug_fail') === '1') {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return err('internal', 'Forced failure for verify');
  }

  const { organizationId, userId } = await getActiveContext();

  let row: { id: string } | undefined;
  try {
    [row] = await db
      .insert(invoices)
      .values({ ...parsed.data, organizationId, createdBy: userId })
      .returning({ id: invoices.id });
    revalidatePath('/invoices');
  } catch (e) {
    if (isUniqueViolation(e)) {
      return err(
        'conflict',
        'An invoice with that number already exists for this org.',
      );
    }
    throw e;
  }

  if (!row) {
    return err('internal', 'Invoice could not be created.');
  }

  redirect(`/invoices/${row.id}`);
};

export const updateInvoice = async (
  _prevState: Result<{ id: string }> | null,
  formData: FormData,
): Promise<Result<{ id: string }>> => {
  const parsed = updateInvoiceInputSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    return err(
      'validation',
      'Check the highlighted fields.',
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  const { organizationId } = await getActiveContext();

  try {
    await db
      .update(invoices)
      .set(parsed.data)
      .where(
        and(
          eq(invoices.id, parsed.data.id),
          eq(invoices.organizationId, organizationId),
        ),
      );
  } catch (e) {
    if (isUniqueViolation(e)) {
      return err(
        'conflict',
        'An invoice with that number already exists for this org.',
      );
    }
    throw e;
  }

  revalidatePath('/invoices');
  return ok({ id: parsed.data.id });
};

export const deleteInvoice = async (
  _prevState: Result<null> | null,
  formData: FormData,
): Promise<Result<null>> => {
  const parsed = deleteInvoiceInputSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    return err(
      'validation',
      'Check the highlighted fields.',
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  const { organizationId } = await getActiveContext();

  const result = await db.transaction(async (tx) => {
    const existing = await tx.query.invoices.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.id, parsed.data.id), eq(t.organizationId, organizationId)),
    });
    if (!existing) {
      return { notFound: true as const };
    }
    await tx
      .delete(invoiceLines)
      .where(eq(invoiceLines.invoiceId, parsed.data.id));
    await tx
      .delete(invoices)
      .where(
        and(
          eq(invoices.id, parsed.data.id),
          eq(invoices.organizationId, organizationId),
        ),
      );
    return { notFound: false as const, deletedNumber: existing.number };
  });

  if (result.notFound) {
    return err('not_found', 'Invoice not found.');
  }

  revalidatePath('/invoices');
  redirect(`/invoices?deleted=${result.deletedNumber}`);
};
