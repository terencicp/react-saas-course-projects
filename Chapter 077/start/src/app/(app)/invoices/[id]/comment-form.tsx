'use client';

import { Button } from '@/components/ui/button';

// TODO(L4) — wire submit to the post mutation
//
// Child of `<CommentThread />` so it shares the query scope. Take the controlled
// `body`/`onBodyChange`, an `onPost(body)` that calls the thread's
// `mutation.mutate`, an `isPending` flag (disables the button + dims the
// textarea), and an `error` string shown in `data-testid="post-error"` above the
// form. `onSuccess` (in the thread) clears the textarea.
export const CommentForm = () => (
  <form className="space-y-2">
    <textarea
      name="body"
      disabled
      placeholder="Add a comment…"
      className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
      rows={3}
    />
    <Button type="submit" size="sm" disabled data-testid="comment-submit">
      Post comment
    </Button>
  </form>
);
