'use server';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import { authedAction } from '@/lib/auth/authed-action';
import { buildObjectKey } from '@/lib/files/keys';
import { ALLOWED_CONTENT_TYPES, BUCKET, MAX_BYTES, r2 } from '@/lib/r2';
import { ok, type Result } from '@/lib/result';

// The first half of the two-step write: sign a short-lived direct-to-R2 PUT URL, write
// NO row. A never-completed upload leaves an orphan object (cheap, lifecycle-swept),
// never an orphan row (a UI lie). The `member` role pin is the structural boundary —
// R2 credentials are app-wide, so the gate lives at the action.
//
// The function is never a byte pipe: only this small JSON crosses the action; the
// multi-MB body goes straight to R2 from the browser. The objectKey is server-built
// from ctx.orgId + a server-generated UUIDv7 (never a client claim — that is the
// tenancy-bypass shape). claimedSize documents intent (R2 does not enforce the signed
// ContentLength); the real size boundary is finalizeUpload's post-upload HEAD (S2).
export const presignedPut = authedAction(
  'member',
  z.strictObject({
    fileName: z.string().min(1).max(255),
    contentType: z.enum(ALLOWED_CONTENT_TYPES),
    claimedSize: z.coerce.number().int().positive().max(MAX_BYTES),
  }),
  async (
    input,
    ctx,
  ): Promise<Result<{ uploadId: string; url: string; objectKey: string }>> => {
    const uploadId = uuidv7();
    const objectKey = buildObjectKey({
      orgId: ctx.orgId,
      fileId: uploadId,
      contentType: input.contentType,
    });

    const url = await getSignedUrl(
      r2,
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: objectKey,
        ContentType: input.contentType,
        ContentLength: input.claimedSize,
      }),
      { signableHeaders: new Set(['content-type']), expiresIn: 300 },
    );

    return ok({ uploadId, url, objectKey });
  },
);
