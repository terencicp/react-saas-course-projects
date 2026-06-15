import { Skeleton } from '@/components/ui/skeleton';

const Loading = () => (
  <div className="max-w-lg space-y-4 px-6 py-10">
    <Skeleton className="h-7 w-40" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-44" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-9 w-24" />
  </div>
);

export default Loading;
