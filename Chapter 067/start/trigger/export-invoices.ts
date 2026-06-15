import { metadata, queue, schemaTask } from '@trigger.dev/sdk/v3';
import { z } from 'zod';

// The per-org back-pressure lane, declared ONCE at module scope (the v4-native
// shape). `concurrencyLimit: 1` serializes runs within a lane; the per-org split
// comes from `concurrencyKey: organizationId` passed at the trigger call in
// startExport, NOT from a dynamically-named queue (the v3 shape v4 rejects).
export const exportQueue = queue({ name: 'export', concurrencyLimit: 1 });

// The durable parent task. `schemaTask` validates the strict payload at the trigger
// edge — never inside the body. organizationId/requestedBy ride in the payload
// because a task has no request context (no requireOrgUser); tenancy is re-derived
// from organizationId via tenantDb inside the run.
//
// The payload ids are `z.string().min(1)`, not `z.uuid()`: the seed (and Better
// Auth) assign base62 text ids (e.g. `org_acme`, `user_alice`), which `z.uuid()`
// would reject — locked to the ids the seed actually produces.
//
// `metadata` is the module-level @trigger.dev/sdk import, NOT a field on the run's
// second arg — destructuring `{ metadata }` off the run params fails tsc.
//
// TODO(L2) — confirm the boundary (queue at module scope, strictObject payload, retry)
// TODO(L3) — count→pagesTotal, sequential paginatePage.triggerAndWait loop (.unwrap() the result) with per-page idempotencyKeys.create([orgId,'page',String(page)]), metadata progress, AbortTaskRunError on empty
// TODO(L4) — sendExportEmail child keyed by [orgId,'export-email'], then one tenantDb transaction: update exports to completed + logAudit export.invoices.completed (actorUserId null)
export const exportInvoices = schemaTask({
  id: 'export-invoices',
  schema: z.strictObject({
    organizationId: z.string().min(1),
    requestedBy: z.string().min(1),
  }),
  queue: exportQueue,
  retry: { maxAttempts: 3 },
  run: async (_payload) => {
    metadata.set('pagesDone', 0);
    return { ok: true };
  },
});
