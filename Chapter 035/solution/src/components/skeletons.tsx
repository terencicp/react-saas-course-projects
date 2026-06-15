import { Skeleton } from '@/components/ui/skeleton';

const ROWS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'] as const;

export const ListSkeleton = () => (
  <div data-testid="list-skeleton" className="flex flex-col gap-1 p-2">
    {ROWS.map((row) => (
      <Skeleton key={row} className="h-12 w-full" />
    ))}
  </div>
);

export const DetailSkeleton = () => (
  <div data-testid="detail-skeleton" className="flex flex-col gap-4 p-6">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-4 w-32" />
    <Skeleton className="h-px w-full" />
    <Skeleton className="h-40 w-full" />
  </div>
);
