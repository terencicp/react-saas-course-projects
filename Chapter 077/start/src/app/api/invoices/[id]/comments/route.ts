// TODO(L3) — GET handler
//
// Replace this static empty page with the real read seam:
//   export const GET = authedRoute('member', commentsQuerySchema, (query, ctx) =>
//     Response.json({ data: commentsPageSchema.parse(
//       listCommentsPage({ orgId: ctx.orgId, invoiceId: ctx.params.id,
//         cursor: query.cursor ?? null, pageSize: 20 }))
//     }));
// `authedRoute` (provided) runs session → role gate → cursor Zod parse; tenancy
// falls out of scoping the read to `ctx.orgId`.
export const GET = () =>
  Response.json({ data: { comments: [], nextCursor: null, prevCursor: null } });
