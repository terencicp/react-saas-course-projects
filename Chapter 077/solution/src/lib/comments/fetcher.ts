// The CLIENT-safe fetcher. `comment-thread.tsx` imports this module, so it must
// never import `getSession`, the store, or `queries.ts` — any transitive
// `server-only` reach fails `next build` from a Client Component. The server
// prefetch reads the store directly in the page, not through this module.

import { type CommentsPage, commentsPageSchema } from '@/lib/comments/schema';

export type FetchCommentsArgs = {
  invoiceId: string;
  cursor: string | null;
};

export const fetchCommentsPage = async ({
  invoiceId,
  cursor,
}: FetchCommentsArgs): Promise<CommentsPage> => {
  const url = new URL(
    `/api/invoices/${invoiceId}/comments`,
    window.location.origin,
  );
  if (cursor) {
    url.searchParams.set('cursor', cursor);
  }

  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(`Failed to load comments (${res.status})`);
  }

  const json = await res.json();
  return commentsPageSchema.parse(json.data);
};
