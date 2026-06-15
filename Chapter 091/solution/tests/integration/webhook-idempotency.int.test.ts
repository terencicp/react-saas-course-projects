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
import { registerSubscription } from '@/test/stripe-retrieve-registry';

const customerId = 'cus_test_idempotency';
const subscriptionId = 'sub_test_idempotency';
const currentPeriodEnd = 1893456000;
// The pinned eventId is the load-bearing setup: without it each postWebhook mints a
// fresh id and the second call is a NEW event, not a replay. The same id sent twice is
// what exercises claimEvent's onConflictDoNothing dedup and the 200-on-dedup-hit rule.
const eventId = 'evt_test_idempotency_fixed';

describe('replayed checkout event is a no-op', () => {
  it(
    'returns 200 with duplicate=true and does not mutate state on a replayed event',
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
        eventId,
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

      const first = await postWebhook(event);
      expect(first.status).toBe(200);
      await expect(first.json()).resolves.toMatchObject({
        received: true,
        duplicate: false,
      });

      const afterFirst = await tx.query.planEntitlements.findFirst({
        where: eq(planEntitlements.organizationId, org.id),
      });
      const updatedAtAfterFirst = afterFirst?.updatedAt;

      const second = await postWebhook(event);
      expect(second.status).toBe(200);
      await expect(second.json()).resolves.toMatchObject({
        received: true,
        duplicate: true,
      });

      const ledger = await tx.query.processedEvents.findMany({
        where: eq(processedEvents.eventId, eventId),
      });
      expect(ledger).toHaveLength(1);

      const afterSecond = await tx.query.planEntitlements.findFirst({
        where: eq(planEntitlements.organizationId, org.id),
      });
      // Equality across two reads reads as "nothing changed in between" — the cleanest
      // mutation-free assertion that the replay touched no Stripe-derived column.
      expect(afterSecond?.updatedAt).toEqual(updatedAtAfterFirst);

      const audits = await tx.query.auditLogs.findMany({
        where: eq(auditLogs.organizationId, org.id),
      });
      expect(audits).toHaveLength(1);
    }),
  );
});
