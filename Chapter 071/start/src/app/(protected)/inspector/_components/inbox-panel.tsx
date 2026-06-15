import type { InboxTailRow } from '@/app/(protected)/inspector/_data';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

type InboxPanelProps = { rows: InboxTailRow[] };

// The active user's last 20 notifications, newest first. One bounded region; each row a
// bounded element carrying data-unread (true when readAt is null). Empty at scaffold
// (no rows); firing populates it once the inbox channel is live (S2).
export const InboxPanel = ({ rows }: InboxPanelProps) => (
  <Card data-testid="inbox-panel" className="p-4">
    <h2 className="text-sm font-semibold">Inbox (active user)</h2>
    <Separator className="my-3" />
    {rows.length === 0 ? (
      <p data-testid="inbox-empty" className="text-sm text-muted-foreground">
        No notifications yet.
      </p>
    ) : (
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.id}
            data-testid="inbox-row"
            data-unread={row.readAt === null ? 'true' : 'false'}
            className="flex flex-col gap-0.5 border-b pb-2 last:border-b-0"
          >
            <span className="text-sm font-medium">{row.title}</span>
            <span className="text-xs text-muted-foreground">{row.body}</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {row.eventType}
            </span>
          </li>
        ))}
      </ul>
    )}
  </Card>
);
