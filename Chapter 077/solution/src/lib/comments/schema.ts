import { z } from 'zod';

// The wire contract for the comment thread, shared by the route handler, the
// client fetcher, and the Server Action. One source of truth so the read seam's
// response writer and the fetcher's parser can never drift.
//
// Ids are `z.string().min(1)`, NOT `z.uuid()`: the in-memory store seeds
// non-UUID ids (`inv-0001`, `cmt-...`, `org-acme`) and the optimistic row
// carries an `optimistic-<uuid>` id — `z.uuid()` would reject all of these and
// `commentsPageSchema.parse(page)` would throw at runtime.
export const commentSchema = z.strictObject({
  id: z.string().min(1),
  invoiceId: z.string().min(1),
  authorId: z.string().min(1),
  authorName: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});

// `prevCursor` is required (not optional) because `maxPages` demands a backward
// cursor for the retained-window math.
export const commentsPageSchema = z.strictObject({
  comments: z.array(commentSchema),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
});

// The direct-input shape the post mutation sends. `invoiceId` is a store id, so
// `z.string().min(1)`, not `z.uuid()`.
export const addCommentInput = z.strictObject({
  invoiceId: z.string().min(1),
  body: z.string().min(1).max(2000),
});

// The route handler's cursor query.
export const commentsQuerySchema = z.strictObject({
  cursor: z.string().nullable().optional(),
});

export type Comment = z.infer<typeof commentSchema>;
export type CommentsPage = z.infer<typeof commentsPageSchema>;
export type AddCommentInput = z.infer<typeof addCommentInput>;
