import type { InspectorResponse } from '@/app/inspector/inspector-store';
import { Card } from '@/components/ui/card';

// The recent-responses log: the last 20 action calls. Each row shows the endpoint,
// the outcome (the Result's real code), the budget (limit/remaining/reset off the ok
// payload) or the rejected gate's key, and a truncated message. NO HTTP status, NO
// RateLimit-* headers — those live only on /api/limit-demo. Rows key on the stable
// `seq` counter (never an array index — Biome noArrayIndexKey). One bounded element.
export const ResponsesLog = ({
  responses,
}: {
  responses: InspectorResponse[];
}) => (
  <Card data-testid="responses-log" className="gap-0 p-0">
    <div className="border-b px-4 py-3 text-sm font-semibold">
      Recent responses
    </div>
    {responses.length === 0 ? (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        No calls yet. Use a “Spam” or “Send one” button.
      </div>
    ) : (
      <ul className="divide-y">
        {responses.map((r) => (
          <li
            key={r.seq}
            data-testid="response-row"
            className="flex items-center justify-between gap-4 px-4 py-2 text-sm"
          >
            <span className="font-mono text-xs">{r.endpoint}</span>
            <span data-outcome={r.outcome} className="font-mono text-xs">
              {r.outcome}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {r.budget
                ? `${r.budget.remaining}/${r.budget.limit}`
                : (r.key ?? '—')}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {r.message}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {r.ms.toFixed(1)}ms
            </span>
          </li>
        ))}
      </ul>
    )}
  </Card>
);
