import 'server-only';

import type { FileMetadata } from '@/db/schema';
import type { Result } from '@/lib/result';

// The tenant-scoped reads for user-upload metadata. Every read goes through
// tenantDb(orgId) with isNull(softDeletedAt) as the inner where — the org predicate is
// the OUTER and (enforced by tenantDb), so a cross-org fileId resolves to null and a
// soft-deleted row stays hidden. There is no `url` column: the download href is signed
// fresh per render, never persisted (a stored URL would expire and lie).
//
// TODO(L4) — getFile/getFileDownloadUrl (isNull(softDeletedAt), RFC5987 ResponseContentDisposition, expiresIn 600) / getSignedGetForKey (tenant-free, raw key) / listFiles (orderBy [uploadedAt desc, id desc], limit+1 keyset cursor)

export const getFile = async (
  _orgId: string,
  _fileId: string,
): Promise<FileMetadata | null> => {
  throw new Error('not implemented');
};

export const getFileDownloadUrl = async (
  _orgId: string,
  _fileId: string,
): Promise<Result<{ url: string; fileName: string; contentType: string }>> => {
  throw new Error('not implemented');
};

export const getSignedGetForKey = async (_args: {
  objectKey: string;
  expiresIn: number;
}): Promise<{ url: string }> => {
  throw new Error('not implemented');
};

export const listFiles = async (_args: {
  orgId: string;
  cursor: string | null;
  limit?: number;
}): Promise<{ rows: FileMetadata[]; nextCursor: string | null }> => {
  throw new Error('not implemented');
};
