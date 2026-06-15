import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { EntitlementRow } from '@/db/queries/entitlements';

type EntitlementPanelProps = {
  entitlement: EntitlementRow;
};

const formatDate = (d: Date | null): string =>
  d ? new Date(d).toISOString() : '';

// The derived-view surface: the org's projected plan_entitlements row, every field
// the projection writes. One bounded region; each field carries a data-testid the
// rendered checks read. The webhook is the only writer — this panel only reads.
export const EntitlementPanel = ({ entitlement }: EntitlementPanelProps) => (
  <Card data-testid="entitlement-panel" className="p-4">
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold">Entitlement</h2>
      <Badge data-testid="entitlement-plan" variant="secondary">
        {entitlement.plan}
      </Badge>
    </div>
    <Separator className="my-3" />
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <dt className="text-muted-foreground">Status</dt>
      <dd data-testid="entitlement-status" className="font-mono">
        {entitlement.status}
      </dd>

      <dt className="text-muted-foreground">Subscription</dt>
      <dd data-testid="entitlement-subscription-id" className="font-mono">
        {entitlement.subscriptionId ?? ''}
      </dd>

      <dt className="text-muted-foreground">Current period end</dt>
      <dd data-testid="entitlement-period-end" className="font-mono">
        {formatDate(entitlement.currentPeriodEnd)}
      </dd>

      <dt className="text-muted-foreground">Cancel at period end</dt>
      <dd data-testid="entitlement-cancel-flag" className="font-mono">
        {String(entitlement.cancelAtPeriodEnd)}
      </dd>

      <dt className="text-muted-foreground">Seats</dt>
      <dd data-testid="entitlement-seats" className="font-mono">
        {entitlement.seats}
      </dd>
    </dl>
  </Card>
);
