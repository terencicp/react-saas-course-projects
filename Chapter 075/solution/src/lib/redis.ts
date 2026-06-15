import 'server-only';

import { Redis } from '@upstash/redis';

export const redis = Redis.fromEnv();

export const pingRedis = async (): Promise<boolean> => {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
};
