'use server';

import { z } from 'zod';

import { authedAction } from '@/lib/auth/authed-action';
import { ALLOWED_CONTENT_TYPES, MAX_BYTES } from '@/lib/r2';
import { err, type Result } from '@/lib/result';

// The first half of the two-step write: sign a short-lived direct-to-R2 PUT URL, write
// NO row. A never-completed upload leaves an orphan object (cheap, lifecycle-swept),
// never an orphan row (a UI lie). The `member` role pin is the structural boundary —
// R2 credentials are app-wide, so the gate lives at the action.
//
// TODO(L2) — uploadId = uuidv7(); objectKey = buildObjectKey({ orgId, fileId: uploadId, contentType }); getSignedUrl over PutObjectCommand({ Bucket, Key, ContentType, ContentLength: claimedSize }) signableHeaders content-type, expiresIn 300; return ok({ uploadId, url, objectKey }); NO db write
export const presignedPut = authedAction(
  'member',
  z.strictObject({
    fileName: z.string().min(1).max(255),
    contentType: z.enum(ALLOWED_CONTENT_TYPES),
    claimedSize: z.coerce.number().int().positive().max(MAX_BYTES),
  }),
  async (
    _input,
    _ctx,
  ): Promise<Result<{ uploadId: string; url: string; objectKey: string }>> =>
    err('internal', 'Not implemented'),
);
