import 'server-only';

import type { Ratelimit } from '@upstash/ratelimit';

import { logRateLimit } from '@/lib/rate-limit-log';

// The fail-open wrapper — the one place the fail-open policy lives. On a Redis
// outage `limiter.limit` throws; we log `rate_limit_unavailable` and return a
// success result so the auth path stays up. Flipping to fail-closed is changing
// the returned `success` to false here, once. The `prefix` is a param because
// `Ratelimit.prefix` is `protected readonly` in @upstash/ratelimit 2.0.8 (reading
// `limiter.prefix` from outside the class is TS2445); call sites pass the limiter's
// prefix literal alongside it.
export type RateLimitResult = Awaited<ReturnType<Ratelimit['limit']>>;

export const safeLimit = async (
  limiter: Ratelimit,
  prefix: string,
  key: string,
): Promise<RateLimitResult> => {
  try {
    return await limiter.limit(key);
  } catch {
    await logRateLimit({
      event: 'rate_limit_unavailable',
      limiter: prefix,
      key,
    });
    return {
      success: true,
      limit: 0,
      remaining: 0,
      reset: 0,
      pending: Promise.resolve(),
    };
  }
};
