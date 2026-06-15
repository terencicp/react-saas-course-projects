'use client';

import { Button } from '@/components/ui/button';
import { combinedAmount } from '@/lib/invoices/money';
import type { InvoiceRow } from '@/lib/invoices/queries';

// The honest-409 surface: the server returned the row it holds now as `current`,
// so the stale tab can recover without a refetch. "Use latest" pulls those values
// into the form (and resets the hidden version) so the resubmit succeeds.
// "Overwrite anyway" renders ONLY for an admin — the gate is enforced again at the
// action, this affordance is the cosmetic half of that gate.
export const ConflictBanner = ({
  current,
  onUseLatest,
  onOverwrite,
  canOverwrite,
}: {
  current: InvoiceRow;
  onUseLatest: () => void;
  onOverwrite: () => void;
  canOverwrite: boolean;
}) => (
  <div
    data-testid="conflict-banner"
    className="space-y-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm"
  >
    <p className="font-medium text-destructive">
      This invoice changed elsewhere while you were editing.
    </p>
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground">
      <dt>Customer</dt>
      <dd className="text-foreground">{current.customerName}</dd>
      <dt>Status</dt>
      <dd className="text-foreground capitalize">{current.status}</dd>
      <dt>Total</dt>
      <dd data-testid="conflict-current-total" className="text-foreground">
        {current.currency} {combinedAmount(current)}
      </dd>
    </dl>
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-testid="conflict-use-latest"
        onClick={onUseLatest}
      >
        Use latest
      </Button>
      {canOverwrite ? (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          data-testid="conflict-overwrite"
          onClick={onOverwrite}
        >
          Overwrite anyway
        </Button>
      ) : null}
    </div>
  </div>
);
