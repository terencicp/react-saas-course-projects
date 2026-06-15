'use client';

import { Skeleton } from '@/components/ui/skeleton';

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

// TODO(L5) — switch on part.state across the four lifecycle states, per-tool skeleton
export const InvoiceStatsCard = (_part: unknown) => null;

InvoiceStatsCard.Skeleton = StatsSkeleton;
