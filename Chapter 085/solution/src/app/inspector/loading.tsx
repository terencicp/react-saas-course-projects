import { Skeleton } from '@/components/ui/skeleton';

const Loading = () => (
  <div className="space-y-6">
    <Skeleton className="h-7 w-32" />
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
    <Skeleton className="h-32 w-full" />
  </div>
);

export default Loading;
