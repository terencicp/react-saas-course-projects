import 'server-only';

// The fail-open wrapper — the one place the fail-open policy lives. On a Redis
// outage `limiter.limit` throws; we log `rate_limit_unavailable` and return a
// success result so the auth path stays up. Flipping to fail-closed is changing
// the returned `success` to false here, once. The `prefix` is a param because
// `Ratelimit.prefix` is `protected readonly` in @upstash/ratelimit 2.0.8 (reading
// `limiter.prefix` from outside the class is TS2445); call sites pass the limiter's
// prefix literal alongside it.
// TODO(L3) — safeLimit(limiter, prefix, key): try limiter.limit(key); catch logs rate_limit_unavailable (limiter: prefix) + returns { success:true, … } (the fail-open knob). prefix is a param because Ratelimit.prefix is protected.
export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  pending: Promise<unknown>;
};

export const safeLimit = async (
  _limiter: never,
  _prefix: string,
  _key: string,
): Promise<RateLimitResult> => ({
  success: true,
  limit: 0,
  remaining: 0,
  reset: 0,
  pending: Promise.resolve(),
});
