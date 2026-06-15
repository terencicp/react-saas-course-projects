'use server';

import { err, type Result } from '@/lib/result';

// TODO(L5) — parse; resolve ip+email; safeLimit ip then email before forgetPassword (per-email survives IP switch); on success ok({ sent: true }); after(pending) both gates.
export const resetAction = async (
  _state: Result<{ sent: true }> | null,
  _formData: FormData,
): Promise<Result<{ sent: true }>> => err('internal', 'Not implemented');
