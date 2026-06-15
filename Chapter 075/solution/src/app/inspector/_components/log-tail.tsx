import { Card } from '@/components/ui/card';
import type { RateLimitLog } from '@/db/schema';

// The structured-log tail: the last 20 rate_limit_log rows, newest first — the
// operator-honest surface (event, limiter, key, remaining, reset, firedAt). pino +
// redaction is the production analog (named-not-built, Chapter 092). Rows key on the
// row id. One bounded element.
export const LogTail = ({ rows }: { rows: RateLimitLog[] }) => (
  <Card data-testid="log-tail" className="gap-0 p-0">
    <div className="border-b px-4 py-3 text-sm font-semibold">
      Structured log (rate_limit_log)
    </div>
    {rows.length === 0 ? (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        No log rows yet.
      </div>
    ) : (
      <ul className="divide-y">
        {rows.map((row) => (
          <li
            key={row.id}
            data-testid="log-row"
            className="flex items-center justify-between gap-4 px-4 py-2 text-xs"
          >
            <span data-event={row.event} className="font-mono">
              {row.event}
            </span>
            <span className="font-mono text-muted-foreground">
              {row.limiter}
            </span>
            <span className="truncate font-mono text-muted-foreground">
              {row.key}
            </span>
            <span className="font-mono text-muted-foreground">
              {row.remaining}
            </span>
            <span className="font-mono text-muted-foreground">
              {row.firedAt.toISOString().slice(11, 19)}
            </span>
          </li>
        ))}
      </ul>
    )}
  </Card>
);
