'use client';

// TODO(L5) — poll /api/usage every 10s, color the bar by remaining
export const TokenUsagePanel = () => (
  <div
    data-testid="token-usage-panel"
    className="space-y-1 rounded-lg border p-3 text-xs"
  >
    <div className="flex justify-between text-muted-foreground">
      <span>Daily token budget</span>
      <span className="tabular-nums">0 / 100,000</span>
    </div>
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        data-testid="usage-bar"
        className="h-full bg-emerald-500"
        style={{ width: '0%' }}
      />
    </div>
    <p className="text-muted-foreground tabular-nums">100,000 remaining</p>
  </div>
);
