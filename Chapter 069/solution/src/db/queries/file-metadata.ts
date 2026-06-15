import 'server-only';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { and, desc, eq, isNull, lt, or } from 'drizzle-orm';

import type { FileMetadata } from '@/db/schema';
import { fileMetadata } from '@/db/schema';
import { tenantDb } from '@/db/tenant';
import { decodeCursor, encodeCursor } from '@/lib/files/cursor';
import { UploadError } from '@/lib/files/errors';
import { BUCKET, r2 } from '@/lib/r2';
import { ok, type Result } from '@/lib/result';

// The tenant-scoped reads for user-upload metadata. Every read goes through
// tenantDb(orgId) with isNull(softDeletedAt) as the inner where — the org predicate is
// the OUTER and (enforced by tenantDb), so a cross-org fileId resolves to null and a
// soft-deleted row stays hidden. There is no `url` column: the download href is signed
// fresh per render, never persisted (a stored URL would expire and lie).

// RFC 5987 encoding for the Content-Disposition filename* parameter, so the browser
// saves the download under the original filename instead of the opaque key segment.
// Percent-encode then restore the limited attr-char set the grammar allows unescaped.
const encodeRFC5987 = (value: string): string =>
  encodeURIComponent(value)
    .replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%(7C|60|5E)/g, (_match, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );

const GET_EXPIRES_IN = 600;

// Tenant-scoped single read. A cross-org or soft-deleted fileId returns null (the org
// predicate is tenantDb's OUTER and; isNull(softDeletedAt) is the inner filter).
export const getFile = async (
  orgId: string,
  fileId: string,
): Promise<FileMetadata | null> => {
  const row = await tenantDb(orgId).query.fileMetadata.findFirst({
    where: and(eq(fileMetadata.id, fileId), isNull(fileMetadata.softDeletedAt)),
  });
  return row ?? null;
};

// A fresh presigned GET for one tenant-owned file. No row → object-not-found → not_found
// (a cross-org id is indistinguishable from a missing file — the tenancy boundary leaks
// nothing). The ResponseContentDisposition makes the download save under the original
// filename. The URL is signed at call time and never cached.
export const getFileDownloadUrl = async (
  orgId: string,
  fileId: string,
): Promise<Result<{ url: string; fileName: string; contentType: string }>> => {
  const row = await getFile(orgId, fileId);
  if (!row) {
    return UploadError.toResult(
      new UploadError('object-not-found', 'That file could not be found.'),
    );
  }

  const url = await getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: row.objectKey,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeRFC5987(
        row.originalFileName,
      )}`,
    }),
    { expiresIn: GET_EXPIRES_IN },
  );

  return ok({
    url,
    fileName: row.originalFileName,
    contentType: row.contentType,
  });
};

// The lone tenant-free helper: signs a GET on a raw key with no tenantDb check. The
// caller is the export worker, inside the trust boundary — it owns the key it just PUT,
// so there is no org row to scope against. First consumed by the export retrofit (S4).
export const getSignedGetForKey = async ({
  objectKey,
  expiresIn,
}: {
  objectKey: string;
  expiresIn: number;
}): Promise<{ url: string }> => {
  const url = await getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: BUCKET, Key: objectKey }),
    { expiresIn },
  );
  return { url };
};

const DEFAULT_LIMIT = 20;

// The newest-first list the /files page pages over. orderBy [uploadedAt desc, id desc]
// matches the composite index; the cursor is the (uploadedAt, id) keyset of the last row
// of the previous page. The n+1 trick: fetch limit+1 rows — if the extra row exists,
// there is a next page and its cursor is the last KEPT row. The keyset predicate
// ("strictly after the cursor in descending order") avoids the OFFSET drift a deep page
// would suffer.
export const listFiles = async ({
  orgId,
  cursor,
  limit = DEFAULT_LIMIT,
}: {
  orgId: string;
  cursor: string | null;
  limit?: number;
}): Promise<{ rows: FileMetadata[]; nextCursor: string | null }> => {
  const decoded = decodeCursor(cursor);
  const cursorAt = decoded ? new Date(decoded.uploadedAt) : null;

  const keysetPredicate =
    decoded && cursorAt
      ? or(
          lt(fileMetadata.uploadedAt, cursorAt),
          and(
            eq(fileMetadata.uploadedAt, cursorAt),
            lt(fileMetadata.id, decoded.id),
          ),
        )
      : undefined;

  const rows = await tenantDb(orgId).query.fileMetadata.findMany({
    where: and(isNull(fileMetadata.softDeletedAt), keysetPredicate),
    orderBy: [desc(fileMetadata.uploadedAt), desc(fileMetadata.id)],
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor({ uploadedAt: last.uploadedAt.toISOString(), id: last.id })
      : null;

  return { rows: page, nextCursor };
};
