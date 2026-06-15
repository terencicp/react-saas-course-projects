'use server';

import {
  HeadObjectCommand,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { z } from 'zod';

import { logAudit } from '@/db/audit-log';
import { fileMetadata } from '@/db/schema';
import { tenantDb } from '@/db/tenant';
import { authedAction } from '@/lib/auth/authed-action';
import { UploadError } from '@/lib/files/errors';
import { ALLOWED_CONTENT_TYPES, BUCKET, MAX_BYTES, r2 } from '@/lib/r2';
import { err, isUniqueViolation, ok, type Result } from '@/lib/result';

// A 404 surfaces on the HEAD as the SDK's `NotFound` exception — the object was never
// PUT (a never-completed upload). Match on the error name / 404 status rather than
// importing the class, so an unrelated failure (network, auth) still throws.
const isMissingObject = (e: unknown): boolean => {
  if (typeof e !== 'object' || e === null) {
    return false;
  }
  const name = (e as { name?: unknown }).name;
  const status = (e as { $metadata?: { httpStatusCode?: unknown } }).$metadata
    ?.httpStatusCode;
  return name === 'NotFound' || name === 'NoSuchKey' || status === 404;
};

// The second half of the two-step write: HEAD the object the browser just PUT, then
// insert the row from server-observed identity — never the client's claim. byteSize
// and contentType come off the HeadObjectCommand (R2 does not enforce the signed
// ContentLength, so the HEAD is the real boundary); a missing object means the upload
// never landed → object-not-found. The unique(objectKey) constraint is the second
// defense layer: a replayed finalize trips 23505 → conflict, never a duplicate row.
//
// No row exists before this point — a never-completed upload leaves only an orphan
// object (cheap, lifecycle-swept), never an orphan row that would lie in the UI.
export const finalizeUpload = authedAction(
  'member',
  z.strictObject({
    uploadId: z.uuid(),
    objectKey: z.string().min(1),
    originalFileName: z.string().min(1).max(255),
    contentType: z.enum(ALLOWED_CONTENT_TYPES),
  }),
  async (input, ctx): Promise<Result<{ fileId: string }>> => {
    let head: HeadObjectCommandOutput;
    try {
      head = await r2.send(
        new HeadObjectCommand({ Bucket: BUCKET, Key: input.objectKey }),
      );
    } catch (e) {
      if (isMissingObject(e)) {
        return UploadError.toResult(
          new UploadError('object-not-found', 'The upload did not complete.'),
        );
      }
      throw e;
    }

    if (head.ContentType !== input.contentType) {
      return UploadError.toResult(
        new UploadError(
          'size-mismatch',
          'The uploaded file did not match what was signed.',
        ),
      );
    }

    const byteSize = head.ContentLength ?? 0;
    if (byteSize > MAX_BYTES) {
      return UploadError.toResult(
        new UploadError('size-mismatch', 'The uploaded file is too large.'),
      );
    }

    try {
      await tenantDb(ctx.orgId).transaction(async (tx) => {
        await tx.insert(fileMetadata).values({
          id: input.uploadId,
          organizationId: ctx.orgId,
          uploadedBy: ctx.user.id,
          objectKey: input.objectKey,
          originalFileName: input.originalFileName,
          contentType: head.ContentType ?? input.contentType,
          byteSize,
        });

        await logAudit(tx, {
          action: 'file.uploaded',
          subjectType: 'file',
          subjectId: input.uploadId,
          payload: { byteSize, contentType: head.ContentType },
        });
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return err('conflict', 'This file has already been finalized.');
      }
      throw e;
    }

    return ok({ fileId: input.uploadId });
  },
);
