'use server';

import type { RateLimitBudget } from '@/lib/rate-limit-headers';
import { err, type Result } from '@/lib/result';

// TODO(L3) — parse; resolve ip+email; safeLimit ip then email before signInEmail (rateLimited on !success); on success ok({ redirectTo, rateLimit: rateLimitBudget(ipLimit) }); after(pending) both gates.
export const signInAction = async (
  _state: Result<{ redirectTo: string; rateLimit: RateLimitBudget }> | null,
  _formData: FormData,
): Promise<Result<{ redirectTo: string; rateLimit: RateLimitBudget }>> =>
  err('internal', 'Not implemented');
