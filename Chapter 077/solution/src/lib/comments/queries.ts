import 'server-only';

import type { CommentsPage } from '@/lib/comments/schema';
import {
  type ListCommentsPageArgs,
  listCommentsPage as storeListCommentsPage,
} from '@/server/store';

// The server-side read used by the SSR prefetch and the route handler. A thin
// wrapper over the store helper that PROJECTS each row to the wire shape —
// dropping the server-internal `orgId` column.
//
// The store's `InvoiceComment` carries `orgId` for tenancy filtering, but
// `commentSchema` is a `strictObject` without it, so feeding raw store rows to
// `commentsPageSchema.parse(page)` would throw `Unrecognized key: "orgId"`.
// Project here so both `.parse()` sites (handler, prefetch) match the strict
// schema.
export const listCommentsPage = (args: ListCommentsPageArgs): CommentsPage => {
  const page = storeListCommentsPage(args);
  return {
    comments: page.comments.map(({ orgId: _orgId, ...rest }) => rest),
    nextCursor: page.nextCursor,
    prevCursor: page.prevCursor,
  };
};
