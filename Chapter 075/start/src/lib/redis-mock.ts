// Inspector-only. The "Force Upstash down" toggle swaps the live limiter's client
// for `makeDownRedis()` so every Redis call throws — proving `safeLimit` fails open
// (logs `rate_limit_unavailable` and lets the request proceed). Imports nothing from
// the student stubs; the student does not edit this file.

// A named error so a `force-down` failure is distinguishable from a real outage in
// logs. Plain Error subclass (this fork carries no RateLimitError base).
export class UpstashConnectionError extends Error {
  override name = 'UpstashConnectionError';

  constructor(
    message = 'Upstash is unreachable (forced down by the inspector).',
  ) {
    super(message);
  }
}

// A Redis-shaped object whose every method rejects with UpstashConnectionError.
// Passed in place of the live `redis` client so the limiter's `limit()` /
// `getRemaining()` round-trips throw, exercising the fail-open path. Typed `never`
// at the seam so it slots into a `Ratelimit` config without widening the real client
// type — the inspector casts at the swap site.
export const makeDownRedis = (): never => {
  const reject = () => {
    throw new UpstashConnectionError();
  };

  return new Proxy(
    {},
    {
      get: () => reject,
    },
  ) as never;
};
