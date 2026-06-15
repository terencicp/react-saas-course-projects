import { Skeleton } from '@/components/ui/skeleton';

const Loading = () => (
  <div className="max-w-lg space-y-4">
    <Skeleton className="h-7 w-48" />
    <Skeleton className="h-64 w-full" />
  </div>
);

export default Loading;
