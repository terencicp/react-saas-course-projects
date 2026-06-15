'use client';

import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { CommentForm } from '@/app/(app)/invoices/[id]/comment-form';
import { addCommentAction } from '@/lib/comments/actions';
import { fetchCommentsPage } from '@/lib/comments/fetcher';
import { commentKeys } from '@/lib/comments/keys';
import type { Comment, CommentsPage } from '@/lib/comments/schema';

export type Session = { userId: string; userName: string };

export const CommentThread = ({
  invoiceId,
  session,
}: {
  invoiceId: string;
  session: Session;
}) => {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');

  // The cache is seeded by the page's SSR `prefetchInfiniteQuery` under the same
  // key, so `data` is populated on first paint with no loading state. From then
  // on the client fetcher hits the route handler: 10s polling (paused on a
  // hidden tab) and "Load older" cursor paging, capped at `maxPages: 10`.
  const {
    data,
    isError,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: commentKeys.lists(invoiceId),
    queryFn: ({ pageParam }) =>
      fetchCommentsPage({ invoiceId, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    getPreviousPageParam: (first) => first.prevCursor ?? undefined,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    maxPages: 10,
  });

  // The cache-update optimistic add. The mandatory step order:
  //   cancelQueries → snapshot whole query data → setQueryData page-0 prepend
  //   → onError restore → onSettled invalidate.
  // `onSettled.invalidateQueries` refetches, flipping the `optimistic-<uuid>`
  // row to its real server id. `updateTag` inside the action handles the Server
  // Component cache; this `invalidateQueries` handles the client cache — the two
  // halves of the two-system invalidation.
  const mutation = useMutation({
    mutationFn: async (text: string) => {
      const result = await addCommentAction({ invoiceId, body: text });
      if (!result.ok) {
        throw new Error(result.error.userMessage);
      }
      return result.data;
    },
    onMutate: async (text) => {
      await queryClient.cancelQueries({
        queryKey: commentKeys.lists(invoiceId),
      });

      const snapshot = queryClient.getQueryData<InfiniteData<CommentsPage>>(
        commentKeys.lists(invoiceId),
      );

      const optimistic: Comment = {
        id: `optimistic-${crypto.randomUUID()}`,
        invoiceId,
        authorId: session.userId,
        authorName: session.userName,
        body: text,
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData<InfiniteData<CommentsPage>>(
        commentKeys.lists(invoiceId),
        (old) => {
          if (!old) {
            return old;
          }
          const [firstPage, ...restPages] = old.pages;
          const headPage: CommentsPage = {
            comments: [optimistic, ...(firstPage?.comments ?? [])],
            nextCursor: firstPage?.nextCursor ?? null,
            prevCursor: firstPage?.prevCursor ?? null,
          };
          return { ...old, pages: [headPage, ...restPages] };
        },
      );

      return { snapshot };
    },
    onError: (_error, _text, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(
          commentKeys.lists(invoiceId),
          context.snapshot,
        );
      }
    },
    onSuccess: () => {
      setBody('');
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: commentKeys.lists(invoiceId),
      });
    },
  });

  const comments = data?.pages.flatMap((page) => page.comments) ?? [];
  const postError =
    mutation.isError && mutation.error instanceof Error
      ? mutation.error.message
      : null;

  return (
    <div className="space-y-3">
      <div className="flex h-5 items-center justify-end">
        {isFetching ? (
          <span
            data-testid="poll-indicator"
            className="flex items-center gap-1 text-xs text-muted-foreground"
          >
            <Loader2Icon className="size-3 animate-spin" />
            Updating…
          </span>
        ) : null}
      </div>

      <CommentForm
        body={body}
        onBodyChange={setBody}
        onPost={(text) => mutation.mutate(text)}
        isPending={mutation.isPending}
        error={postError}
      />

      {isError ? (
        <p
          data-testid="thread-error"
          className="rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive"
        >
          Couldn’t load comments. Retrying…
        </p>
      ) : null}

      <div data-testid="comment-thread" className="space-y-3">
        {comments.map((comment) => (
          <article
            key={comment.id}
            data-testid="comment-row"
            data-comment-id={comment.id}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <div className="font-medium">{comment.authorName}</div>
            <p className="text-muted-foreground">{comment.body}</p>
          </article>
        ))}
      </div>

      <button
        type="button"
        data-testid="load-older"
        onClick={() => fetchNextPage()}
        disabled={!hasNextPage || isFetchingNextPage}
        className="flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground disabled:opacity-60"
      >
        {isFetchingNextPage ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : hasNextPage ? (
          'Load older'
        ) : (
          'End of thread'
        )}
      </button>
    </div>
  );
};
