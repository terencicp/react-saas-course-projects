import { schemaTask } from '@trigger.dev/sdk/v3';
import { z } from 'zod';

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
// TODO(L3) — listInvoices({ orgId, view: 'active', cursor, pageSize: 500 }) → { csv: rowsToCsv(rows), nextCursor, rowCount }
export const paginatePage = schemaTask({
  id: 'paginate-page',
  schema: z.strictObject({
    organizationId: z.string().min(1),
    page: z.int().nonnegative(),
    cursor: z.string().nullable(),
  }),
  run: async () => {
    throw new Error('not implemented');
  },
});
