import 'server-only';

import { logRateLimit } from '@/lib/rate-limit-log';
import { err, type Result } from '@/lib/result';
import type { RateLimitResult } from '@/lib/safe-limit';

// `reset` from the library is a Unix ms timestamp; the budget and headers carry it
// as delta-seconds via Math.ceil((reset - Date.now()) / 1000) — raw ms is a bug.
//
// The budget rides the action `Result` (no HTTP headers on the action path —
// headers() is read-only in a Server Action). `RateLimit-*` headers + Retry-After +
// the JSON 429 body exist only on the route-handler twin (`/api/limit-demo`),
// present for parity. `rateLimited` is the action reject helper: it logs the honest
// `rate_limit_rejected` event (gate + key) and returns the same opaque message
// regardless of which gate tripped — no information leak.
export type RateLimitBudget = {
  limit: number;
  remaining: number;
  reset: number;
};

export const rateLimitBudget = (r: RateLimitResult): RateLimitBudget => ({
  limit: r.limit,
  remaining: r.remaining,
  reset: Math.ceil((r.reset - Date.now()) / 1000),
});

export const rateLimitHeaders = (
  r: RateLimitResult,
): Record<string, string> => ({
  'RateLimit-Limit': String(r.limit),
  'RateLimit-Remaining': String(r.remaining),
  'RateLimit-Reset': String(Math.ceil((r.reset - Date.now()) / 1000)),
});

export const rateLimited = async (
  r: RateLimitResult,
  gate: 'ip' | 'email',
  key: string,
): Promise<Result<never>> => {
  await logRateLimit({
    event: 'rate_limit_rejected',
    limiter: gate,
    key,
    remaining: r.remaining,
    reset: r.reset,
  });
  return err('rate_limited', 'Too many attempts. Please try again later.');
};

export const rateLimitedResponse = (r: RateLimitResult): Response =>
  Response.json(
    { error: 'Too many attempts. Please try again later.' },
    {
      status: 429,
      headers: {
        ...rateLimitHeaders(r),
        'Retry-After': String(Math.ceil((r.reset - Date.now()) / 1000)),
      },
    },
  );
