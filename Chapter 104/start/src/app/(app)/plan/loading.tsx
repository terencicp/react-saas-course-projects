import { Skeleton } from '@/components/ui/skeleton';

const Loading = () => (
  <div className="space-y-4">
    <Skeleton className="h-7 w-24" />
    <Skeleton className="h-20 w-full" />
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-20 w-full" />
  </div>
);

export default Loading;
