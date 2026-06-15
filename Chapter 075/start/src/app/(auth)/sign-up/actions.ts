'use server';

import type { RateLimitBudget } from '@/lib/rate-limit-headers';
import { err, type Result } from '@/lib/result';

// TODO(L4) — parse; resolve ip; single safeLimit(signUpLimiter, 'ip:'+ip) before signUpEmail (per-IP only); on success ok({ redirectTo:/verify-email, rateLimit }); after(pending).
export const signUpAction = async (
  _state: Result<{ redirectTo: string; rateLimit: RateLimitBudget }> | null,
  _formData: FormData,
): Promise<Result<{ redirectTo: string; rateLimit: RateLimitBudget }>> =>
  err('internal', 'Not implemented');
