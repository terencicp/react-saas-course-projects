import 'server-only';

import type { Ratelimit } from '@upstash/ratelimit';

// TODO(L2) — three module-scope Ratelimit instances (signin 10/1m, signup 5/10m, reset 3/15m), each analytics:true + own ephemeralCache + distinct prefix; export LIMITER_MAX. This is the ONLY place new Ratelimit(...) may appear.
export const signInLimiter = {} as unknown as Ratelimit;
export const signUpLimiter = {} as unknown as Ratelimit;
export const resetLimiter = {} as unknown as Ratelimit;
export const LIMITER_MAX = { signin: 10, signup: 5, reset: 3 } as const;
