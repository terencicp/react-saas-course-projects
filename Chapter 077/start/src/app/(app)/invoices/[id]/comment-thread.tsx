'use client';

import { CommentForm } from '@/app/(app)/invoices/[id]/comment-form';

export type Session = { userId: string; userName: string };

// TODO(L2) — minimal read-only thread off the hydrated cache (useInfiniteQuery
//   with a throwing queryFn + getNextPageParam: () => undefined; data is
//   hydrated so the fetcher never fires).
// TODO(L3) — real read shape: client fetcher queryFn, getNextPageParam /
//   getPreviousPageParam, refetchInterval: 10_000, refetchIntervalInBackground:
//   false, maxPages: 10, "Load older" button, poll-indicator, thread-error.
// TODO(L4) — useMutation optimistic add: cancelQueries → snapshot → setQueryData
//   page-0 prepend → onError restore → onSettled invalidateQueries; render the
//   <CommentForm /> wired to mutation.mutate.
export const CommentThread = ({
  invoiceId,
  session,
}: {
  invoiceId: string;
  session: Session;
}) => {
  // Props are consumed by the lesson's hook/mutation; referenced here so the
  // stub typechecks without an unused-binding error.
  void invoiceId;
  void session;

  return (
    <div className="space-y-3">
      <CommentForm />
      <div
        data-testid="comment-thread"
        className="rounded-md border px-3 py-2 text-sm text-muted-foreground"
      >
        Thread not wired yet.
      </div>
    </div>
  );
};
