'use server';

import { err, type Result } from '@/lib/result';

// TODO(L2) — createInvoice: five seams; safeParse → err('validation', …, flattenError); getActiveContext after parse; insert with stamped org+createdBy; isUniqueViolation → conflict; redirect after try/catch.
export const createInvoice = async (
  _prevState: Result<{ id: string }> | null,
  _formData: FormData,
): Promise<Result<{ id: string }>> => {
  return err('internal', 'Not implemented');
};

// TODO(L3) — updateInvoice: parse(update schema); db.update set where AND(id, organizationId); revalidatePath; ok({id}); no redirect.
export const updateInvoice = async (
  _prevState: Result<{ id: string }> | null,
  _formData: FormData,
): Promise<Result<{ id: string }>> => {
  return err('internal', 'Not implemented');
};

// TODO(L4) — deleteInvoice: db.delete where AND(id, organizationId); revalidatePath; redirect('/invoices'). (L6 wraps in db.transaction + ?deleted toast param.)
export const deleteInvoice = async (
  _prevState: Result<null> | null,
  _formData: FormData,
): Promise<Result<null>> => {
  return err('internal', 'Not implemented');
};
