import { schemaTask } from '@trigger.dev/sdk/v3';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { member, organization } from '@/db/schema/auth';
import { tenantDb } from '@/db/tenant';
import ExportReadyEmail from '@/emails/ExportReadyEmail';
import { sendEmail } from '@/lib/email';
import { err, type Result } from '@/lib/result';

// The guarded side-effect child. The export-ready email is its own triggerAndWait
// child (not an inline sendEmail call) so a parent retry re-issuing the same
// idempotency key returns the cached child result rather than sending a second
// email. The child re-derives tenancy via tenantDb (no request context): the
// recipient is read through the tenant-scoped member→user join (so a non-member id
// can never reach a send), and the org name comes from the global organization row.
//
// The payload ids are `z.string().min(1)` (base62 seed ids, not UUIDs). rowCount is
// the total exported; downloadUrl is the placeholder link the parent set.
//
// A Resend suppression is an EXPECTED outcome, not a failure: sendEmail returns
// err('forbidden', …) (a Result) for a suppressed recipient, so the child returns
// that Result rather than throwing — the run still completes and the parent's audit
// note records the skip. The throw-to-surface alternative (let a suppression bubble
// as an error so the run shows failed) is rejected here: a suppressed recipient is a
// deliverability fact about the user, not a fault in the export.
//
// Structured logs carry messageId/disposition only — never the recipient address or
// any PII (the Chapter 080 discipline).
export const sendExportEmail = schemaTask({
  id: 'send-export-email',
  schema: z.strictObject({
    organizationId: z.string().min(1),
    recipientUserId: z.string().min(1),
    rowCount: z.int(),
    downloadUrl: z.string(),
  }),
  run: async ({
    organizationId,
    recipientUserId,
    rowCount,
    downloadUrl,
  }): Promise<Result<{ id: string }>> => {
    const recipient = await tenantDb(organizationId).query.member.findFirst({
      where: eq(member.userId, recipientUserId),
      with: { user: true },
    });
    if (!recipient?.user) {
      return err('not_found', 'The export recipient is no longer a member.');
    }

    const org = await db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
    });

    const result = await sendEmail({
      to: recipient.user.email,
      subject: 'Your invoice export is ready',
      react: ExportReadyEmail({
        orgName: org?.name ?? 'your organization',
        rowCount,
        downloadUrl,
      }),
      idempotencyKey: `export-email:${organizationId}:${recipientUserId}:${rowCount}`,
    });

    if (!result.ok) {
      console.info('send-export-email skipped', {
        disposition: result.error.code,
      });
      return result;
    }

    console.info('send-export-email sent', {
      messageId: result.data.id,
      disposition: 'sent',
    });
    return result;
  },
});
