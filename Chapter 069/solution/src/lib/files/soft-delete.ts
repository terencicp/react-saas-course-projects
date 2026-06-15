import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';

import { logAudit } from '@/db/audit-log';
import { fileMetadata } from '@/db/schema';
import { tenantDb } from '@/db/tenant';
import { err, ok, type Result } from '@/lib/result';

// Provided and named, but NOT exercised this chapter — the softDeletedAt column ships
// and the list reads filter on it, but no delete button is built (no UI consumes this).
// It is here so the soft-delete vocabulary is complete: a future delete surface calls
// softDeleteFile, which stamps softDeletedAt (keeping the globally-unique objectKey
// reserved while the bytes may still exist) and writes one file.soft_deleted audit row,
// both inside the same tenantDb transaction so the row update and the audit commit or
// roll back together.
export const softDeleteFile = async (
  orgId: string,
  fileId: string,
): Promise<Result<{ fileId: string }>> => {
  const updated = await tenantDb(orgId).transaction(async (tx) => {
    const rows = await tx
      .update(fileMetadata)
      .set({ softDeletedAt: new Date() })
      .where(
        and(
          eq(fileMetadata.organizationId, orgId),
          eq(fileMetadata.id, fileId),
          isNull(fileMetadata.softDeletedAt),
        ),
      )
      .returning({ id: fileMetadata.id });

    const row = rows[0];
    if (!row) {
      return null;
    }

    await logAudit(tx, {
      action: 'file.soft_deleted',
      subjectType: 'file',
      subjectId: fileId,
    });

    return row;
  });

  if (!updated) {
    return err('not_found', 'File not found.');
  }
  return ok({ fileId });
};
