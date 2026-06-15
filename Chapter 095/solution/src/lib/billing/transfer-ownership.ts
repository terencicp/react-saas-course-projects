import 'server-only';

import { eq } from 'drizzle-orm';

import { logAudit } from '@/db/audit-log';
import { member, organization } from '@/db/schema/auth';
import { withTenant } from '@/db/tenant';

// The billing-side ownership transfer — the mutation that re-points the org's owner
// when a subscription's billing owner changes (the Stripe Customer email moves to a
// new admin). This is a security-relevant mutation: it changes who controls billing
// and tenancy for the whole org.
//
// Audit-log discipline (082 finding 3, pre-fixed): the in-transaction
// `logAudit(tx, …)` write rides the same transaction as the ownership change, so a
// committed transfer can never exist without its audit record. The slug is
// `org.ownership-transferred` — the same canonical `entity.verb-pasttense` the
// admin-side transfer uses, so both paths land one event name in the log. The
// payload is redacted to the two ids the event is about. The transaction runs under
// withTenant so the audit_logs org-isolation policy passes.
export const transferBillingOwnership = async (
  orgId: string,
  previousOwnerId: string,
  nextOwnerId: string,
): Promise<void> => {
  await withTenant(orgId, async (tx) => {
    await tx
      .update(organization)
      .set({ ownerId: nextOwnerId })
      .where(eq(organization.id, orgId));

    // Demote the previous owner and promote the next one on their membership rows.
    await tx
      .update(member)
      .set({ role: 'admin' })
      .where(eq(member.userId, previousOwnerId));

    await tx
      .update(member)
      .set({ role: 'owner' })
      .where(eq(member.userId, nextOwnerId));

    // The in-transaction audit write — co-transacts with the ownership change.
    await logAudit(tx, {
      organizationId: orgId,
      actorUserId: null,
      action: 'org.ownership-transferred',
      subjectType: 'organization',
      subjectId: orgId,
      payload: { previousOwnerId, nextOwnerId },
    });
  });
};
