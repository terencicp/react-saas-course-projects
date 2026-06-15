import 'server-only';

import { asc, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { cache } from 'react';

import { ACTING_USER_COOKIE } from '@/app/(protected)/inspector/constants';
import { db } from '@/db';
import { member, organization } from '@/db/schema/auth';
import { requireOrgUser } from '@/lib/auth';
import type { Role } from '@/lib/auth/roles';

// The inspector's own read path. It starts from the session-derived requireOrgUser
// (the real { user, orgId, role }) and, in development only, lets the dev acting-user
// cookie override which seeded identity the page renders as — so the switcher can show
// each role without a real sign-in dance. This override lives HERE, in the inspector's
// read path, and never touches requireOrgUser: the privileged actions (changeMemberRole,
// sendInvitation) still resolve identity from the validated session, so the dev cookie
// cannot spoof a real mutation.

const isDev = process.env.NODE_ENV !== 'production';

type SwitchableOrg = { id: string; name: string };
type SeededUser = { id: string; name: string; role: string };

type InspectorContext = {
  userId: string;
  orgId: string;
  orgName: string;
  role: Role;
  orgs: SwitchableOrg[];
  members: SeededUser[];
};

// Resolve the identity the inspector renders as. In production this is exactly the
// session identity. In development, an `inspector-acting-user` cookie naming a seeded
// user swaps the resolved identity/org/role to that user's active membership.
const resolveActingIdentity = async (): Promise<{
  userId: string;
  orgId: string;
  role: Role;
}> => {
  const sessionContext = await requireOrgUser();
  const base = {
    userId: sessionContext.user.id,
    orgId: sessionContext.orgId,
    role: sessionContext.role,
  };

  if (!isDev) {
    return base;
  }

  const jar = await cookies();
  const actingUserId = jar.get(ACTING_USER_COOKIE)?.value;
  if (!actingUserId) {
    return base;
  }

  const membership = await db.query.member.findFirst({
    where: eq(member.userId, actingUserId),
  });
  if (!membership) {
    return base;
  }

  return {
    userId: actingUserId,
    orgId: membership.organizationId,
    role: membership.role as Role,
  };
};

// `cache` dedupes the resolution across the page's Suspense-wrapped panels so they
// all render against the same acting identity in one request.
export const getInspectorContext = cache(
  async (): Promise<InspectorContext> => {
    const identity = await resolveActingIdentity();

    const org = await db.query.organization.findFirst({
      where: eq(organization.id, identity.orgId),
    });

    const memberships = await db.query.member.findMany({
      where: eq(member.userId, identity.userId),
      with: { organization: true },
    });
    const orgs = memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
    }));

    const orgMembers = await db.query.member.findMany({
      where: eq(member.organizationId, identity.orgId),
      with: { user: true },
      orderBy: asc(member.createdAt),
    });
    const members = orgMembers.map((m) => ({
      id: m.userId,
      name: m.user?.name ?? m.userId,
      role: m.role,
    }));

    return {
      userId: identity.userId,
      orgId: identity.orgId,
      orgName: org?.name ?? 'No active organization',
      role: identity.role,
      orgs,
      members,
    };
  },
);
