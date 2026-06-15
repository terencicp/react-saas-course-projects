'use server';

import { updateTag } from 'next/cache';
import { authedInputAction } from '@/lib/authed-action';
import { consumeForceFailure } from '@/lib/comments/force-failure';
import { addCommentInput } from '@/lib/comments/schema';
import { invoiceCommentsTag } from '@/lib/tags';
import { findUser, pushAudit, pushComment } from '@/server/store';

// The write seam of the comment thread — the direct-input twin (callable from
// the `useMutation` as `addCommentAction({ invoiceId, body })`), NOT the
// FormData `authedAction`. The inspector's force-500 flag is consumed FIRST: a
// forced failure returns an `internal` Result and writes NO audit row, so the
// optimistic row rolls back (R10) with the audit tail untouched. Invalidation is
// `updateTag` (read-your-writes, in-app form), never `revalidateTag(tag, 'max')`.
export const addCommentAction = authedInputAction(
  'member',
  addCommentInput,
  async (input, ctx) => {
    if (consumeForceFailure(ctx.userId)) {
      return {
        ok: false as const,
        error: {
          code: 'internal' as const,
          userMessage: 'Forced failure for verification',
        },
      };
    }

    const authorName = findUser(ctx.userId)?.name ?? ctx.userId;
    const row = pushComment({
      orgId: ctx.orgId,
      invoiceId: input.invoiceId,
      authorId: ctx.userId,
      authorName,
      body: input.body,
    });

    pushAudit({
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: 'comment.added',
      subjectId: row.id,
    });

    await updateTag(invoiceCommentsTag(input.invoiceId));

    return {
      ok: true as const,
      data: { id: row.id, createdAt: row.createdAt },
    };
  },
);
