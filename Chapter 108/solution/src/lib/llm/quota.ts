import 'server-only';

import { findQuotaRow, todayUtc, usageQuota } from '@/server/store';

export const DAILY_TOKEN_CAP = 100_000;

export type UsageReport = {
  used: number;
  cap: number;
  remaining: number;
};

export type QuotaReservation =
  | { ok: true }
  | { ok: false; error: { code: 'quota_exceeded'; userMessage: string } };

// Find today's row, or push a fresh `tokensUsed: 0` one — the in-memory analogue
// of `INSERT ... ON CONFLICT DO NOTHING`. Reservation and accounting both ensure
// the row exists before touching it.
const ensureTodayRow = (userId: string) => {
  const existing = findQuotaRow(userId, todayUtc());
  if (existing) {
    return existing;
  }

  const row = {
    userId,
    day: todayUtc(),
    tokensUsed: 0,
    updatedAt: new Date().toISOString(),
  };
  usageQuota.push(row);
  return row;
};

// Today's used/cap/remaining — the shape `/api/usage` returns and the panel
// polls. Missing row reads as zero used.
export const readUsage = async (userId: string): Promise<UsageReport> => {
  const used = findQuotaRow(userId, todayUtc())?.tokensUsed ?? 0;
  return {
    used,
    cap: DAILY_TOKEN_CAP,
    remaining: Math.max(0, DAILY_TOKEN_CAP - used),
  };
};

// Reserve before the stream spends — runs in `withLlmQuota` before delegating.
// At or over the cap, refuse with a typed 429-shaped error the wrapper returns;
// otherwise the call proceeds and `addUsage` charges in arrears. Ensure-then-
// compare keeps the two steps readable.
export const reserveQuotaOrRefuse = async (
  userId: string,
): Promise<QuotaReservation> => {
  const row = ensureTodayRow(userId);

  if (row.tokensUsed >= DAILY_TOKEN_CAP) {
    return {
      ok: false,
      error: {
        code: 'quota_exceeded',
        userMessage: "You've reached today's usage limit. Try again tomorrow.",
      },
    } as const;
  }

  return { ok: true } as const;
};

// Charge tokens as they are consumed — runs per step in the route's
// `onStepFinish`. A soft daily ceiling: charged in arrears, so a single request
// can push slightly past the cap before the next reservation refuses. Input and
// output tokens are summed into one number (production separates the two prices).
export const addUsage = async (
  userId: string,
  tokens: number,
): Promise<void> => {
  const row = ensureTodayRow(userId);
  row.tokensUsed += tokens;
  row.updatedAt = new Date().toISOString();
};
