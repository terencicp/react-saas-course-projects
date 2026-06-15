'use client';

import { useEffect, useState } from 'react';

type Usage = {
  used: number;
  cap: number;
  remaining: number;
};

// Green over half the budget left, yellow in the 10–50% band, red under 10%.
const barColor = (fraction: number): string => {
  if (fraction > 0.5) {
    return 'bg-emerald-500';
  }
  if (fraction >= 0.1) {
    return 'bg-amber-500';
  }
  return 'bg-red-500';
};

export const TokenUsagePanel = () => {
  const [usage, setUsage] = useState<Usage | null>(null);

  // The only allowed useEffect: polling an external system. Refetch every 10s and
  // clear the interval on unmount.
  useEffect(() => {
    const controller = new AbortController();

    const poll = async () => {
      try {
        const res = await fetch('/api/usage', { signal: controller.signal });
        if (res.ok) {
          setUsage((await res.json()) as Usage);
        }
      } catch {
        // Ignore transient/aborted poll failures; the next tick retries.
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), 10_000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, []);

  const used = usage?.used ?? 0;
  const cap = usage?.cap ?? 100_000;
  const remaining = usage?.remaining ?? cap;
  const remainingFraction = cap === 0 ? 0 : remaining / cap;
  const usedPercent = Math.min(100, Math.round((used / cap) * 100));

  return (
    <div
      data-testid="token-usage-panel"
      className="space-y-1 rounded-lg border p-3 text-xs"
    >
      <div className="flex justify-between text-muted-foreground">
        <span>Daily token budget</span>
        <span className="tabular-nums">
          {used.toLocaleString()} / {cap.toLocaleString()}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          data-testid="usage-bar"
          className={`h-full transition-all motion-reduce:transition-none ${barColor(remainingFraction)}`}
          style={{ width: `${usedPercent}%` }}
        />
      </div>
      <p className="text-muted-foreground tabular-nums">
        {remaining.toLocaleString()} remaining
      </p>
    </div>
  );
};
