import 'server-only';

// TODO(L3) — auditLogCount(orgId): count auditLogs for the org through withTenant.
// Returns 0 so the raw-helpers panel renders cleanly in start.
export const auditLogCount = async (_orgId: string): Promise<number> => 0;

// TODO(L3) — recentAuditLogs(orgId): the org's most-recent events, newest first,
// through withTenant. Returns an empty tail so the inspector's audit panel renders
// its empty state in start.
export const recentAuditLogs = async (
  _orgId: string,
): Promise<{ id: string; action: string; createdAt: Date }[]> => [];
