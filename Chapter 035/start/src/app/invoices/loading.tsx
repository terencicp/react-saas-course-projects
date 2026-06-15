import { Skeleton } from '@/components/ui/skeleton';

const ROWS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'] as const;

const InvoicesLoading = () => (
  <div
    data-testid="invoices-loading"
    className="grid flex-1 md:grid-cols-[20rem_1fr]"
  >
    <div className="flex flex-col gap-2 p-2">
      {ROWS.map((row) => (
        <Skeleton key={row} className="h-12 w-full" />
      ))}
    </div>
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-40 w-full" />
    </div>
  </div>
);

export default InvoicesLoading;
