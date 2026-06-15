import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { auditLogs } from '@/db/audit';
import { planEntitlements, processedEvents } from '@/db/schema';
import { organization } from '@/db/schema/auth';
import { withRollback } from '@/test/db/with-rollback';
import { signedInAs } from '@/test/fixtures/auth';
import { checkoutCompleted } from '@/test/fixtures/stripe-events';
import { fixtureSubscription } from '@/test/fixtures/stripe-subscription';
import { postWebhook } from '@/test/helpers/post-webhook';
import { resendCalls } from '@/test/msw/handlers/resend';
import { registerSubscription } from '@/test/stripe-retrieve-registry';

const customerId = 'cus_test_checkout_happy';
const subscriptionId = 'sub_test_checkout_happy';
const currentPeriodEnd = 1893456000;

// Every assertion targets a caller-observable surface (the Response, the
// processed_events row, the plan_entitlements fields, the audit_logs row, resendCalls) —
// never a handler internal, so a no-op rename of dispatch/projection leaves this green.
describe('happy-path checkout.session.completed webhook', () => {
  it(
    'upserts the entitlement, claims the event, and writes an audit log when a valid checkout completes',
    withRollback(async ({ tx }) => {
      const { org } = await signedInAs({ role: 'admin' }, tx);
      await tx
        .update(organization)
        .set({ stripeCustomerId: customerId })
        .where(eq(organization.id, org.id));

      const event = checkoutCompleted({
        orgId: org.id,
        customerId,
        subscriptionId,
      });
      registerSubscription(
        fixtureSubscription({
          id: subscriptionId,
          lookupKey: 'course_pro_monthly',
          status: 'trialing',
          currentPeriodEnd,
          orgId: org.id,
        }),
      );

      const response = await postWebhook(event);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        received: true,
        duplicate: false,
      });

      const ledger = await tx.query.processedEvents.findMany({
        where: eq(processedEvents.eventId, event.id),
      });
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({
        provider: 'stripe',
        eventType: 'checkout.session.completed',
      });

      const entitlement = await tx.query.planEntitlements.findFirst({
        where: eq(planEntitlements.organizationId, org.id),
      });
      expect(entitlement).toMatchObject({
        plan: 'pro',
        status: 'trialing',
        subscriptionId,
        cancelAtPeriodEnd: false,
      });
      expect(entitlement?.lastEventAt).toEqual(new Date(event.created * 1000));

      const audits = await tx.query.auditLogs.findMany({
        where: eq(auditLogs.organizationId, org.id),
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        action: 'billing.subscription.activated',
        actorUserId: null,
      });

      expect(resendCalls).toHaveLength(0);
    }),
  );
});
