'use server';

import { z } from 'zod';

import { authedAction } from '@/lib/auth/authed-action';
import { ALLOWED_CONTENT_TYPES } from '@/lib/r2';
import { err, type Result } from '@/lib/result';

// The second half of the two-step write: HEAD the object the browser just PUT, then
// insert the row from server-observed identity — never the client's claim. No row exists
// before this point, so a never-completed upload leaves only an orphan object (cheap,
// lifecycle-swept), never an orphan row that would lie in the UI.
//
// TODO(L3) — HeadObjectCommand (404→object-not-found); assert head.ContentType===contentType and head.ContentLength<=MAX_BYTES (else size-mismatch); tenantDb(orgId).transaction: insert row (id=uploadId, byteSize/contentType from HEAD, uploadedBy) + logAudit file.uploaded; return ok({ fileId })
export const finalizeUpload = authedAction(
  'member',
  z.strictObject({
    uploadId: z.uuid(),
    objectKey: z.string().min(1),
    originalFileName: z.string().min(1).max(255),
    contentType: z.enum(ALLOWED_CONTENT_TYPES),
  }),
  async (_input, _ctx): Promise<Result<{ fileId: string }>> =>
    err('internal', 'Not implemented'),
);
