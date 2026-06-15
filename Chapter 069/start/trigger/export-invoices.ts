import {
  AbortTaskRunError,
  idempotencyKeys,
  metadata,
  queue,
  schemaTask,
} from '@trigger.dev/sdk/v3';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { logAudit } from '@/db/audit-log';
import { countInvoices } from '@/db/queries/invoices';
import { exports } from '@/db/schema';
import { tenantDb } from '@/db/tenant';
import { ExportError } from '@/lib/exports/errors';

import { paginatePage } from './paginate-page';
import { sendExportEmail } from './send-export-email';

const PAGE_SIZE = 500;

// The per-org back-pressure lane, declared ONCE at module scope (the v4-native
// shape). `concurrencyLimit: 1` serializes runs within a lane; the per-org split
// comes from `concurrencyKey: organizationId` passed at the trigger call in
// startExport, NOT from a dynamically-named queue (the v3 shape v4 rejects).
export const exportQueue = queue({ name: 'export', concurrencyLimit: 1 });

// The durable parent task. `schemaTask` validates the strict payload at the trigger
// edge — never inside the body — so a malformed payload fails before the body runs
// and before any retry is spent. organizationId/requestedBy ride in the payload
// because a task has no request context (no requireOrgUser); tenancy is re-derived
// from organizationId via tenantDb inside the run.
//
// The payload ids are `z.string().min(1)`, not `z.uuid()`: the seed (and Better
// Auth) assign base62 text ids (e.g. `org_acme`, `user_alice`), which `z.uuid()`
// would reject — locked to the ids the seed actually produces.
//
// `metadata` is the module-level @trigger.dev/sdk import, NOT a field on the run's
// second arg (which exposes ctx/init/signal only) — destructuring `{ metadata }`
// off the run params fails tsc.
//
// `id: 'export-invoices'` is the durable identity — the string, not the symbol, is
// what Trigger.dev keys on across deploys (so the task survives a redeploy and a
// crashed run resumes against the same task definition).
//
// The body's two closing side effects are exactly-once across a parent retry: the
// email is a triggerAndWait child keyed by [orgId, 'export-email'] (a retry returns
// the cached child result), and the exports-row update + the export.invoices.completed
// audit write share one tenantDb transaction (the audit after the email — audit the
// shipped outcome).
export const exportInvoices = schemaTask({
  id: 'export-invoices',
  schema: z.strictObject({
    organizationId: z.string().min(1),
    requestedBy: z.string().min(1),
  }),
  queue: exportQueue,
  retry: { maxAttempts: 3 },
  run: async ({ organizationId, requestedBy }, { ctx }) => {
    // Count first so pagesTotal is known before any child fires. The empty
    // resultset is a permanent failure on these inputs — AbortTaskRunError stops
    // immediately and spawns no children; a plain throw would burn all three
    // retries on inputs that can never succeed.
    const total = await countInvoices({ orgId: organizationId });
    if (total === 0) {
      throw new AbortTaskRunError(
        new ExportError('EMPTY_RESULTSET', 'no invoices to export').message,
      );
    }

    const pagesTotal = Math.ceil(total / PAGE_SIZE);
    metadata.set('pagesTotal', pagesTotal);

    // The loop is sequential by design: each page is its own triggerAndWait
    // checkpoint, so a crash between pages resumes at the first uncompleted page
    // when the parent re-issues the same per-page idempotency key. A parallel
    // Promise.all would race the queue's concurrencyLimit and reorder rows.
    let csv = '';
    let cursor: string | null = null;
    for (let page = 0; page < pagesTotal; page++) {
      // scope defaults to 'run' — namespaced to this parent run id, so a parent
      // retry re-issues the same key and the completed child returns cached. The
      // parts array is string[], so the numeric page is stringified
      // (idempotencyKeys.create rejects a raw number).
      const result = await paginatePage
        .triggerAndWait(
          { organizationId, page, cursor },
          {
            idempotencyKey: await idempotencyKeys.create([
              organizationId,
              'page',
              String(page),
            ]),
          },
        )
        .unwrap();

      // The whole CSV is accumulated in memory, bounded by the per-org row cap.
      // The streaming alternative (write each page straight to an object-storage
      // multipart upload) lands in Chapter 069's object-storage upload.
      csv += result.csv;
      cursor = result.nextCursor;

      // Progress is set from the PARENT — its view is the user-facing one;
      // omitting this write is the zero-bar bug.
      metadata.set('pagesDone', page + 1);
    }

    console.log('export-invoices csv built', { bytes: csv.length });

    // TODO(L5) — after the page loop: Buffer.from(csv); r2.send(PutObjectCommand({ Key: exports/org/${orgId}/${ctx.run.id}.csv, Body, ContentType text/csv, ContentDisposition })); getSignedGetForKey({ objectKey, expiresIn: 600 }) → metadata.set('downloadUrl') → sendExportEmail; NO file_metadata row; PUT before the close-out txn
    const downloadUrl = `https://example.com/exports/${ctx.run.id}.csv`;
    metadata.set('downloadUrl', downloadUrl);

    // Side effect #1 — the ready email, as its own triggerAndWait child keyed by
    // [organizationId, 'export-email'] (run-scoped: a parent retry re-issues the same
    // key, so the child returns its cached result and Resend is never called twice).
    // It is a child task — not an inline sendEmail call — for that durability +
    // idempotency. The recipient is `requestedBy` (the user who clicked Export); an
    // org-owner override is named-not-built. A suppression returns an err Result from
    // the child (the run still completes, the audit note records the skip).
    const emailResult = await sendExportEmail
      .triggerAndWait(
        {
          organizationId,
          recipientUserId: requestedBy,
          rowCount: total,
          downloadUrl,
        },
        {
          idempotencyKey: await idempotencyKeys.create([
            organizationId,
            'export-email',
          ]),
        },
      )
      .unwrap();
    const emailSuppressed = !emailResult.ok;

    // Side effect #2 — close the run: update the exports row to `completed` and write
    // the export.invoices.completed audit entry in ONE tenantDb transaction (the audit
    // INSERT needs the transaction-local app.org_id the facade sets, and the two writes
    // commit or roll back together). The audit write comes AFTER the email — we audit
    // the outcome we shipped, not the intent. logAudit is called with explicit context
    // (organizationId + actorUserId: null): a task has no session, so the system-actor
    // null is information, not a missing value.
    await tenantDb(organizationId).transaction(async (tx) => {
      await tx
        .update(exports)
        .set({
          status: 'completed',
          rowCount: total,
          completedAt: new Date(),
        })
        .where(eq(exports.runId, ctx.run.id));

      await logAudit(tx, {
        action: 'export.invoices.completed',
        subjectType: 'export',
        subjectId: ctx.run.id,
        organizationId,
        actorUserId: null,
        payload: { rowCount: total, emailSuppressed },
      });
    });

    return { ok: true, runId: ctx.run.id, rowCount: total };
  },
});
