import { schemaTask } from '@trigger.dev/sdk/v3';
import { z } from 'zod';

import { listInvoices } from '@/db/queries/invoices';
import { rowsToCsv } from '@/lib/exports/to-csv';

// The per-page child. Each page is its own triggerAndWait checkpoint from the
// parent, so a crash between pages resumes at the first uncompleted page when the
// parent re-issues the same per-page idempotency key. The child re-derives tenancy
// via tenantDb inside listInvoices (no request context); cursor pagination is the
// stable restart point.
//
// The payload ids are `z.string().min(1)` (base62 seed ids, not UUIDs). `page` is a
// non-negative int; `cursor` is the previous page's createdAt cursor (nullable for
// page 0).
//
// The CSV for this page is materialized in memory and returned to the parent, which
// concatenates the pages — bounded by the per-org row cap. The streaming alternative
// (write each page straight to an object-storage multipart upload instead of holding
// the whole CSV) lands in Chapter 069's object-storage upload.
export const paginatePage = schemaTask({
  id: 'paginate-page',
  schema: z.strictObject({
    organizationId: z.string().min(1),
    page: z.int().nonnegative(),
    cursor: z.string().nullable(),
  }),
  run: async ({ organizationId, cursor }) => {
    const { rows, nextCursor } = await listInvoices({
      orgId: organizationId,
      view: 'active',
      cursor,
      pageSize: 500,
    });
    return { csv: rowsToCsv(rows), nextCursor, rowCount: rows.length };
  },
});
