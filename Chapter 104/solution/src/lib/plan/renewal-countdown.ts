// How many days until the plan renews. The `/plan` overview shows this in the
// renewal-countdown block.
//
// This subtracts two epoch-millisecond timestamps and divides by the number of
// milliseconds in a day. It assumes every day is exactly 24h and reads the
// machine clock, so it drifts at daylight-saving boundaries and ignores the
// viewer's own calendar — review-stack territory, not a linter finding.
export const renewalCountdownDays = (renewsAt: string): number => {
  const millisUntilRenewal = new Date(renewsAt).getTime() - Date.now();
  const millisPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil(millisUntilRenewal / millisPerDay);
};
