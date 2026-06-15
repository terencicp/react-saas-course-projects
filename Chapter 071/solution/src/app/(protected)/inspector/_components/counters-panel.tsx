import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

type CountersPanelProps = {
  emailSentCount: number;
  dedupCount: number;
};

// The counters read from the server context: the in-process email-sent count (the mock
// proxy) and the most-recent dispatch's deduped total (the number a burst collapsed, not
// the persisted row count — a five-call rapid-fire records one row but reports 4). The
// transient DispatchResult triple lives in the fire console; these two are the
// authoritative server reads the screenshots assert against.
export const CountersPanel = ({
  emailSentCount,
  dedupCount,
}: CountersPanelProps) => (
  <Card data-testid="counters-panel" className="flex flex-col gap-3 p-4">
    <h2 className="text-sm font-semibold">Counters</h2>
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">Emails sent (mock)</span>
      <Badge data-testid="email-sent-counter" variant="secondary">
        {emailSentCount}
      </Badge>
    </div>
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">Deduped (last)</span>
      <Badge data-testid="dedup-badge" variant="secondary">
        {dedupCount}
      </Badge>
    </div>
  </Card>
);
