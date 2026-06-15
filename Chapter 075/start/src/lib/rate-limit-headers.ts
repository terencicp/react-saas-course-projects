import 'server-only';

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
// TODO(L3) — rateLimitBudget (reset→delta-seconds), rateLimitHeaders (route-twin), rateLimited (action reject → err('rate_limited', opaque)), rateLimitedResponse (route-twin 429).
export type RateLimitBudget = {
  limit: number;
  remaining: number;
  reset: number;
};

export const rateLimitBudget = (_r: RateLimitResult): RateLimitBudget => ({
  limit: 0,
  remaining: 0,
  reset: 0,
});

export const rateLimitHeaders = (
  _r: RateLimitResult,
): Record<string, string> => ({});

export const rateLimited = async (
  _r: RateLimitResult,
  _gate: 'ip' | 'email',
  _key: string,
): Promise<Result<never>> =>
  err('rate_limited', 'Too many attempts. Please try again later.');

export const rateLimitedResponse = (_r: RateLimitResult): Response =>
  Response.json(
    { error: 'Too many attempts. Please try again later.' },
    { status: 429 },
  );
