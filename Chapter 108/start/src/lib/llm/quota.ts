import 'server-only';

export const DAILY_TOKEN_CAP = 100_000;

export type UsageReport = {
  used: number;
  cap: number;
  remaining: number;
};

export type QuotaReservation =
  | { ok: true }
  | { ok: false; error: { code: 'quota_exceeded'; userMessage: string } };

// TODO(L4) — readUsage / reserveQuotaOrRefuse / addUsage over usageQuota, DAILY_TOKEN_CAP cap
export const readUsage = async (_userId: string): Promise<UsageReport> => ({
  used: 0,
  cap: DAILY_TOKEN_CAP,
  remaining: DAILY_TOKEN_CAP,
});

export const reserveQuotaOrRefuse = async (
  _userId: string,
): Promise<QuotaReservation> => ({ ok: true }) as const;

export const addUsage = async (
  _userId: string,
  _tokens: number,
): Promise<void> => {};
