import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { member, organization } from '@/db/schema/auth';

// The billing-side ownership transfer — the mutation that re-points the org's owner
// when a subscription's billing owner changes (the Stripe Customer email moves to a
// new admin). This is a security-relevant mutation: it changes who controls billing
// and tenancy for the whole org.
//
// SEEDED AUDIT DEFECT #3 (finding 3) — missing audit-log write (081 L3):
// this UPDATEs organizations.ownerId AND the membership owner row inside a
// db.transaction but writes NO audit row. Every other security-relevant mutation in
// lib/ co-transacts an audit write; this one is silent, so the ownership change is
// invisible to an auditor and to the customer-facing Activity page. The healthy
// shape adds the in-transaction audit write for the ownership-transfer event with a
// redacted payload. The target ships the bug on purpose; do not "fix" it here. (This
// file deliberately imports no audit writer — the absence IS the defect; finding 3
// documents the fix.)
export const transferBillingOwnership = async (
  orgId: string,
  previousOwnerId: string,
  nextOwnerId: string,
): Promise<void> => {
  await db.transaction(async (tx) => {
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

    // SEEDED #3: no in-transaction audit write here. The mutation lands silently.
  });
};
