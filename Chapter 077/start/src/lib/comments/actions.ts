'use server';

import { authedInputAction } from '@/lib/authed-action';
import { addCommentInput } from '@/lib/comments/schema';

// TODO(L4) — addCommentAction
//
// The write seam: the direct-input twin (callable from the `useMutation` as
// `addCommentAction({ invoiceId, body })`), NOT the FormData `authedAction`.
// Inside, consume the inspector's force-500 flag FIRST (return an `internal`
// Result, write NO audit row), otherwise `pushComment` + `pushAudit` then
// `await updateTag(invoiceCommentsTag(input.invoiceId))` (read-your-writes —
// never `revalidateTag(tag, 'max')`), returning `{ id, createdAt }`.
export const addCommentAction = authedInputAction(
  'member',
  addCommentInput,
  async () => ({
    ok: false as const,
    error: { code: 'internal' as const, userMessage: 'Not implemented' },
  }),
);
