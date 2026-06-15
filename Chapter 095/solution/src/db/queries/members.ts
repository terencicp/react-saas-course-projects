import 'server-only';

import { asc } from 'drizzle-orm';

import { member } from '@/db/schema/auth';
import { tenantDb } from '@/db/tenant';

// The members panel's read. Scoped through the facade — no manual where org_id; the
// facade composes the org predicate as the outer and. with: { user: true } returns
// each member's joined user row (name/email) for the panel's label.
export const listMembers = async (orgId: string) =>
  tenantDb(orgId).query.member.findMany({
    with: { user: true },
    orderBy: asc(member.createdAt),
  });
