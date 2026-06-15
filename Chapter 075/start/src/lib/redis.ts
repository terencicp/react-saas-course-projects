import 'server-only';

import type { Redis } from '@upstash/redis';

// TODO(L2) — export redis = Redis.fromEnv() and pingRedis().
export const redis = {} as unknown as Redis;
export const pingRedis = async (): Promise<boolean> => false;
