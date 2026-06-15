import { Skeleton } from '@/components/ui/skeleton';

const Loading = () => (
  <div className="space-y-4">
    <Skeleton className="h-7 w-32" />
    <Skeleton className="h-10 w-full" />
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  </div>
);

export default Loading;
