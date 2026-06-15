import 'server-only';

import { desc } from 'drizzle-orm';

import { auditLogs } from '@/db/audit';
import { withTenant } from '@/db/tenant';

// Reads through withTenant so the org-isolation policy governs the count under a
// non-BYPASSRLS role (the predicate compares against the set app.org_id). Local dev
// connects as the superuser postgres, which bypasses RLS, so the policy is wired
// and demonstrable but not enforced on this path until a non-owner request role.
export const auditLogCount = async (orgId: string): Promise<number> =>
  withTenant(orgId, async (tx) => {
    const rows = await tx.select({ id: auditLogs.id }).from(auditLogs);
    return rows.length;
  });

// The audit tail the inspector renders: the org's most-recent events, newest first.
// Reads through withTenant for the same org-isolation reason as the count.
export const recentAuditLogs = async (orgId: string) =>
  withTenant(orgId, async (tx) =>
    tx
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(20),
  );
