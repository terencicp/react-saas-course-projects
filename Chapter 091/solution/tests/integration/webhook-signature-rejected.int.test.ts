import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { auditLogs } from '@/db/audit';
import { planEntitlements, processedEvents } from '@/db/schema';
import { withRollback } from '@/test/db/with-rollback';
import { signedInAs } from '@/test/fixtures/auth';
import { checkoutCompleted } from '@/test/fixtures/stripe-events';
import { postWebhook } from '@/test/helpers/post-webhook';
import { resendCalls } from '@/test/msw/handlers/resend';

const customerId = 'cus_test_tampered';
const subscriptionId = 'sub_test_tampered';

// The event body is well-formed; only the signature is corrupted at send time. No
// fixtureSubscription is registered: a verified payload never reaches the handler, so
// subscriptions.retrieve must never be called — if the front door let the body through,
// the missing registration would surface as a loud lookup failure, reinforcing the proof.
describe('tampered signature is rejected before any work', () => {
  it(
    'rejects with 400 problem+json and writes nothing when the signature is tampered',
    withRollback(async ({ tx }) => {
      const { org } = await signedInAs({ role: 'admin' }, tx);

      const event = checkoutCompleted({
        orgId: org.id,
        customerId,
        subscriptionId,
      });

      const response = await postWebhook(event, { tamperSignature: true });

      expect(response.status).toBe(400);
      expect(response.headers.get('content-type')).toBe(
        'application/problem+json',
      );
      await expect(response.json()).resolves.toMatchObject({
        title: 'invalid_signature',
        status: 400,
      });

      // The emptiness of every downstream surface IS "rejected before any work": the
      // route verifies before it claims, dispatches, or sends mail, so nothing was
      // claimed, the seeded entitlement is untouched, and no outbound call fired.
      const ledger = await tx.query.processedEvents.findMany({
        where: eq(processedEvents.eventId, event.id),
      });
      expect(ledger).toHaveLength(0);

      const entitlement = await tx.query.planEntitlements.findFirst({
        where: eq(planEntitlements.organizationId, org.id),
      });
      expect(entitlement?.plan).toBe('free');

      const audits = await tx.query.auditLogs.findMany({
        where: eq(auditLogs.organizationId, org.id),
      });
      expect(audits).toHaveLength(0);

      expect(resendCalls).toHaveLength(0);
    }),
  );
});
