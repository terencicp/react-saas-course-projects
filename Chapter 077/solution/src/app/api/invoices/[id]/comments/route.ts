import { authedRoute } from '@/lib/authed-route';
import { listCommentsPage } from '@/lib/comments/queries';
import { commentsPageSchema, commentsQuerySchema } from '@/lib/comments/schema';

// The public read seam the client fetcher hits. Tenancy falls out of scoping
// the read to `ctx.orgId`: a cross-org `invoiceId` yields an empty page, so no
// foreign rows leak. `listCommentsPage` already projects off the server-only
// `orgId` column, so the strict `commentsPageSchema.parse` matches.
export const GET = authedRoute('member', commentsQuerySchema, (query, ctx) => {
  const page = listCommentsPage({
    orgId: ctx.orgId,
    invoiceId: ctx.params.id,
    cursor: query.cursor ?? null,
    pageSize: 20,
  });
  return Response.json({ data: commentsPageSchema.parse(page) });
});
