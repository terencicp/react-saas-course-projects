import 'server-only';

import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { member, organization } from '@/db/schema/auth';

// The org read `upgrade`/`openPortal` need. requireOrgUser returns no org object and
// the Better Auth `organization` table carries no email column, so the Customer
// email is resolved here from the owner member's joined user row. Returns the
// stripeCustomerId pointer (null until first Checkout) alongside it.
//
// Server-only: the billing actions call this; it is never reachable from a client
// component. Throws if the org or an owner is missing (a provisioning invariant —
// every org has exactly one owner from the create flow).
export const getOrgWithOwnerEmail = async (
  orgId: string,
): Promise<{
  id: string;
  stripeCustomerId: string | null;
  ownerEmail: string;
}> => {
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
  });
  if (!org) {
    throw new Error(`organization not found: ${orgId}`);
  }

  const owner = await db.query.member.findFirst({
    where: and(eq(member.organizationId, orgId), eq(member.role, 'owner')),
    with: { user: true },
    orderBy: asc(member.createdAt),
  });
  if (!owner?.user) {
    throw new Error(`organization has no owner: ${orgId}`);
  }

  return {
    id: org.id,
    stripeCustomerId: org.stripeCustomerId,
    ownerEmail: owner.user.email,
  };
};

// The local persist after Stripe creates the Customer. Stripe-side create happens
// FIRST (in `upgrade`); this UPDATE points the org at the returned id. An orphan
// Customer on a failed retry is fixable; a local pointer to a non-existent Customer
// is not — which is why the ordering is create-then-persist, never the reverse.
export const setStripeCustomerId = async (
  orgId: string,
  customerId: string,
): Promise<void> => {
  await db
    .update(organization)
    .set({ stripeCustomerId: customerId })
    .where(eq(organization.id, orgId));
};
