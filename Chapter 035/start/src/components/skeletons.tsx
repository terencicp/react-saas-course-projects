// TODO(L4) — ListSkeleton + DetailSkeleton over shadcn <Skeleton>, stable string keys

export const ListSkeleton = () => (
  <div data-testid="list-skeleton" className="p-2" />
);

export const DetailSkeleton = () => (
  <div data-testid="detail-skeleton" className="p-6" />
);
