import 'server-only';

import { asc, desc, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { cache } from 'react';

import { ACTING_USER_COOKIE } from '@/app/(protected)/inspector/constants';
import { db } from '@/db';
import { auditLogs } from '@/db/audit';
import type { EntitlementRow } from '@/db/queries/entitlements';
import { getEntitlement } from '@/db/queries/entitlements';
import { processedEvents } from '@/db/schema';
import { member, organization } from '@/db/schema/auth';
import { requireOrgUser } from '@/lib/auth';
import type { Role } from '@/lib/auth/roles';

// The Stripe inspector's read path. It starts from the session-derived
// requireOrgUser (the real { user, orgId, role }) and, in development only, lets the
// dev acting-user cookie override which seeded identity the page renders as — so the
// switcher can show each role without a real sign-in dance. This override lives HERE,
// in the inspector's read path, and never touches requireOrgUser: the privileged
// billing actions still resolve identity from the validated session, so the dev
// cookie cannot spoof a real Checkout.

const isDev = process.env.NODE_ENV !== 'production';

type SwitchableOrg = { id: string; name: string };
type SeededUser = { id: string; name: string; role: string };

type ProcessedEventRow = {
  id: number;
  provider: string;
  eventId: string;
  eventType: string;
  receivedAt: Date;
};

type AuditRow = {
  id: string;
  action: string;
  createdAt: Date;
};

type InspectorContext = {
  userId: string;
  orgId: string;
  orgName: string;
  role: Role;
  stripeCustomerId: string | null;
  orgs: SwitchableOrg[];
  members: SeededUser[];
  entitlement: EntitlementRow;
  processedEvents: ProcessedEventRow[];
  auditLogs: AuditRow[];
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

    // The derived entitlement row (the inspector's headline surface). At scaffold the
    // getEntitlement stub returns a `free` placeholder; S3 reads the real row.
    const entitlement = await getEntitlement(identity.orgId);

    // The processed_events tail — newest first, the idempotency forensic surface.
    // Empty at seed; a verified `stripe trigger` lands a row.
    const events = await db
      .select({
        id: processedEvents.id,
        provider: processedEvents.provider,
        eventId: processedEvents.eventId,
        eventType: processedEvents.eventType,
        receivedAt: processedEvents.receivedAt,
      })
      .from(processedEvents)
      .orderBy(desc(processedEvents.id))
      .limit(20);

    // The audit tail for the active org — newest first (read with the global db; the
    // inspector runs as the superuser postgres, which has BYPASSRLS).
    const audit = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, identity.orgId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(20);

    return {
      userId: identity.userId,
      orgId: identity.orgId,
      orgName: org?.name ?? 'No active organization',
      role: identity.role,
      stripeCustomerId: org?.stripeCustomerId ?? null,
      orgs,
      members,
      entitlement,
      processedEvents: events,
      auditLogs: audit,
    };
  },
);
