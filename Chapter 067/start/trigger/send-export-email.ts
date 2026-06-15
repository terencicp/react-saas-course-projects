import { schemaTask } from '@trigger.dev/sdk/v3';
import { z } from 'zod';

// The guarded side-effect child. The export-ready email is its own triggerAndWait
// child (not an inline sendEmail call) so a parent retry re-issuing the same
// idempotency key returns the cached child result rather than sending a second
// email. The child re-derives tenancy via tenantDb (no request context).
//
// The payload ids are `z.string().min(1)` (base62 seed ids, not UUIDs). rowCount is
// the total exported; downloadUrl is the placeholder link the parent set.
//
// TODO(L4) — tenantDb lookups (org name + recipient email), render ExportReadyEmail, sendEmail; suppression returns the err Result, not a throw
export const sendExportEmail = schemaTask({
  id: 'send-export-email',
  schema: z.strictObject({
    organizationId: z.string().min(1),
    recipientUserId: z.string().min(1),
    rowCount: z.int(),
    downloadUrl: z.string(),
  }),
  run: async () => {
    throw new Error('not implemented');
  },
});
