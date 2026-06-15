// The CLIENT-safe fetcher. `comment-thread.tsx` imports this module, so it must
// never import `getSession`, the store, or `queries.ts` — any transitive
// `server-only` reach fails `next build` from a Client Component. The server
// prefetch reads the store directly in the page, not through this module.

import type { CommentsPage } from '@/lib/comments/schema';

export type FetchCommentsArgs = {
  invoiceId: string;
  cursor: string | null;
};

// TODO(L2) — in-process branch
// TODO(L3) — client fetch branch
//
// The real client branch builds `new URL('/api/invoices/<id>/comments',
// window.location.origin)`, sets the `cursor` search param when present,
// `fetch(url, { credentials: 'same-origin' })`, throws on `!res.ok`, then
// validates `commentsPageSchema.parse(json.data)`.
export const fetchCommentsPage = (
  _args: FetchCommentsArgs,
): Promise<CommentsPage> => {
  throw new Error('TODO(L3) — client fetcher not wired yet');
};
