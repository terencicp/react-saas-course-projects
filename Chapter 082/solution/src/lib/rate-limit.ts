import 'server-only';

import { Ratelimit } from '@upstash/ratelimit';

import { redis } from '@/lib/redis';

export const signInLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix: 'rl:signin',
  analytics: true,
  ephemeralCache: new Map(),
});

export const signUpLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '10 m'),
  prefix: 'rl:signup',
  analytics: true,
  ephemeralCache: new Map(),
});

export const resetLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '15 m'),
  prefix: 'rl:reset',
  analytics: true,
  ephemeralCache: new Map(),
});

export const LIMITER_MAX = { signin: 10, signup: 5, reset: 3 } as const;
