'use client';

import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';

// Child of `<CommentThread />` so it shares the query scope through the mutation
// passed down. `onSubmit` calls the thread's `mutation.mutate(body)`; while it
// is pending the button is disabled and the textarea dims; `onError` surfaces
// the message in `data-testid="post-error"` above the form. The textarea value
// is owned by the thread so the mutation's `onSuccess` can clear it.
export const CommentForm = ({
  body,
  onBodyChange,
  onPost,
  isPending,
  error,
}: {
  body: string;
  onBodyChange: (body: string) => void;
  onPost: (body: string) => void;
  isPending: boolean;
  error: string | null;
}) => {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }
    onPost(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {error ? (
        <p
          data-testid="post-error"
          className="rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <textarea
        name="body"
        value={body}
        onChange={(event) => onBodyChange(event.target.value)}
        disabled={isPending}
        placeholder="Add a comment…"
        className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
        rows={3}
      />
      <Button
        type="submit"
        size="sm"
        disabled={isPending}
        data-testid="comment-submit"
      >
        Post comment
      </Button>
    </form>
  );
};
