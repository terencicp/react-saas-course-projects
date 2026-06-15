import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

type ProcessedEventRow = {
  id: number;
  provider: string;
  eventId: string;
  eventType: string;
  receivedAt: Date;
};

type ProcessedEventsTailProps = {
  rows: ProcessedEventRow[];
};

// The idempotency forensic surface: the processed_events ledger, newest first. Empty
// at seed (zero rows); a verified `stripe trigger` lands one row, a replay lands none.
export const ProcessedEventsTail = ({ rows }: ProcessedEventsTailProps) => (
  <Card data-testid="processed-events-tail" className="p-4">
    <h2 className="text-sm font-semibold">Processed events</h2>
    <Separator className="my-3" />
    {rows.length === 0 ? (
      <p className="text-sm text-muted-foreground">No events processed yet.</p>
    ) : (
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.id}
            data-testid="processed-event-row"
            className="flex items-center justify-between gap-4 font-mono text-xs"
          >
            <span>{row.eventType}</span>
            <span className="text-muted-foreground">{row.eventId}</span>
          </li>
        ))}
      </ul>
    )}
  </Card>
);
