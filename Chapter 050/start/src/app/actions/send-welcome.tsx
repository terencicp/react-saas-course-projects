'use server';

import { err, type Result } from '@/lib/result';

export const sendWelcomeEmail = async (
  _prevState: Result<{ id: string }> | null,
  _formData: FormData,
): Promise<Result<{ id: string }>> => {
  // TODO(L4) — five seams: parse, getActiveContext, idempotency key, placeholder verifyUrl, sendEmail
  return err('internal', 'Not implemented');
};
