'use client';

import type { UIToolInvocation } from 'ai';
import { Temporal } from 'temporal-polyfill';
import { Skeleton } from '@/components/ui/skeleton';
import type { InvoiceTools } from '@/lib/llm/tools';

type StatsInvocation = UIToolInvocation<InvoiceTools['getInvoiceStats']>;

// The card-shaped loading affordance the tool-parts model provides (107 L2) —
// stat-slot placeholders, not a generic loading glyph. Mapped over a stable
// string-key tuple so Biome's `noArrayIndexKey` stays happy.
const STAT_SLOTS = ['count', 'total', 'oldest'] as const;

const StatsSkeleton = () => (
  <div
    data-testid="invoice-stats-skeleton"
    className="space-y-3 rounded-lg border p-4"
  >
    <Skeleton className="h-4 w-32" />
    <div className="grid grid-cols-3 gap-3">
      {STAT_SLOTS.map((slot) => (
        <Skeleton key={slot} className="h-10 w-full" />
      ))}
    </div>
  </div>
);

const StatsError = () => (
  <p className="text-sm text-destructive">
    I couldn&apos;t load those stats. Try rephrasing.
  </p>
);

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);

const formatDueDate = (iso: string | null): string =>
  iso === null
    ? '—'
    : Temporal.PlainDate.from(iso).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

// The whole tool invocation is the prop so `part.state`/`part.input`/`part.output`
// narrow inside the switch. Switch on `part.state` (not a destructured `state` —
// destructuring before the switch widens `part.output` away from the narrowed arm).
export const InvoiceStatsCard = (part: StatsInvocation) => {
  switch (part.state) {
    case 'input-streaming':
      return null;
    case 'input-available':
      return <StatsSkeleton />;
    case 'output-error':
      return <StatsError />;
    case 'output-available': {
      if ('error' in part.output) {
        return <StatsError />;
      }

      const { count, totalAmount, byStatus, oldestUnpaidDueDate } = part.output;
      const filter = part.input.status;

      return (
        <div
          data-testid="invoice-stats-card"
          className="space-y-3 rounded-lg border p-4"
        >
          <h3 className="text-sm font-medium">
            Invoice stats{filter ? ` · ${filter}` : ''}
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Count</p>
              <p className="font-medium tabular-nums">{count}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-medium tabular-nums">
                {formatCurrency(totalAmount)}
              </p>
            </div>
          </div>
          <dl className="space-y-1 text-xs">
            {Object.entries(byStatus).map(([status, n]) => (
              <div key={status} className="flex justify-between">
                <dt className="capitalize text-muted-foreground">{status}</dt>
                <dd className="tabular-nums">{n}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            Oldest unpaid due:{' '}
            <span className="tabular-nums text-foreground">
              {formatDueDate(oldestUnpaidDueDate)}
            </span>
          </p>
        </div>
      );
    }
    default:
      return null;
  }
};

InvoiceStatsCard.Skeleton = StatsSkeleton;
