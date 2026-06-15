import 'server-only';

import { desc } from 'drizzle-orm';
import { headers } from 'next/headers';
import {
  IDENTITY_EMAIL,
  inspectorState,
} from '@/app/inspector/inspector-store';
import { db } from '@/db';
import { type RateLimitLog, rateLimitLog } from '@/db/schema';
import { getClientIp } from '@/lib/keys';
import {
  LIMITER_MAX,
  resetLimiter,
  signInLimiter,
  signUpLimiter,
} from '@/lib/rate-limit';
import { pingRedis } from '@/lib/redis';

// One readout row of the "Remaining tokens" panel: the limiter prefix, the full key,
// the live remaining (from getRemaining — consumes no budget) paired with the static
// cap, and the reset countdown in seconds. `remaining` is null when the limiter stub
// has no getRemaining yet (scaffold state) — the panel renders `n/a`.
export type RemainingRow = {
  testid: string;
  prefix: string;
  key: string;
  remaining: number | null;
  limit: number;
  resetSeconds: number | null;
};

// `getRemaining(key)` consumes no budget. In scaffold state the limiter is an inert
// stub with no getRemaining method, so the call throws — caught here and degraded to
// `n/a`. Lights up once S1 declares the real Ratelimit instances.
const readRemaining = async (
  limiter: unknown,
  prefix: string,
  key: string,
  testid: string,
  limit: number,
): Promise<RemainingRow> => {
  try {
    const fn = (
      limiter as {
        getRemaining?: (
          id: string,
        ) => Promise<{ remaining: number; reset: number }>;
      }
    ).getRemaining;
    if (typeof fn !== 'function') {
      return {
        testid,
        prefix,
        key,
        remaining: null,
        limit,
        resetSeconds: null,
      };
    }
    const { remaining, reset } = await fn.call(limiter, key);
    return {
      testid,
      prefix,
      key,
      remaining,
      limit,
      resetSeconds: Math.max(0, Math.ceil((reset - Date.now()) / 1000)),
    };
  } catch {
    return { testid, prefix, key, remaining: null, limit, resetSeconds: null };
  }
};

// The reset spam target is always eve@example.com (the seeded reset victim), regardless
// of the active session identity. The reset-email readout tracks eve so the panel
// reflects the budget the "Spam reset" / "Distinct IPs (reset)" runners actually spend.
const RESET_EMAIL_TARGET = 'eve@example.com';

// The five readout rows. Sign-in is dual-keyed (ip + email — the active identity's
// address, the spam/cross-IP target), sign-up is per-IP, reset is per-IP + per-email.
// The reset-email row tracks the reset spam target (eve), NOT the active identity, so
// it reads 0/3 after a reset spam. The `ip:` rows resolve the SAME key the gated
// actions consume — `getClientIp(await headers())` — so the panel reflects the budget
// the actions actually spend, not a hardcoded placeholder.
export const readRemainingRows = async (): Promise<RemainingRow[]> => {
  const email = IDENTITY_EMAIL[inspectorState.activeIdentity] ?? 'unknown';
  const ipKey = `ip:${getClientIp(await headers())}`;

  return Promise.all([
    readRemaining(
      signInLimiter,
      'rl:signin',
      ipKey,
      'remaining-row-signin-ip',
      LIMITER_MAX.signin,
    ),
    readRemaining(
      signInLimiter,
      'rl:signin',
      `email:${email}`,
      'remaining-row-signin-email',
      LIMITER_MAX.signin,
    ),
    readRemaining(
      signUpLimiter,
      'rl:signup',
      ipKey,
      'remaining-row-signup-ip',
      LIMITER_MAX.signup,
    ),
    readRemaining(
      resetLimiter,
      'rl:reset',
      ipKey,
      'remaining-row-reset-ip',
      LIMITER_MAX.reset,
    ),
    readRemaining(
      resetLimiter,
      'rl:reset',
      `email:${RESET_EMAIL_TARGET}`,
      'remaining-row-reset-email',
      LIMITER_MAX.reset,
    ),
  ]);
};

// The "Upstash up?" badge reads pingRedis(). When "Force Upstash down" is on, the
// badge reads down regardless of the live DB.
export const readUpstashUp = async (): Promise<boolean> => {
  if (inspectorState.toggles.forceDown) {
    return false;
  }
  try {
    return await pingRedis();
  } catch {
    return false;
  }
};

// The structured-log tail: the last 20 rate_limit_log rows, newest first.
export const readLogTail = async (): Promise<RateLimitLog[]> => {
  try {
    return await db
      .select()
      .from(rateLimitLog)
      .orderBy(desc(rateLimitLog.firedAt))
      .limit(20);
  } catch {
    return [];
  }
};
