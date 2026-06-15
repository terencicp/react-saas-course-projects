export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export type Role = 'owner' | 'admin' | 'member';

// Role hierarchy: owner ⊇ admin ⊇ member. `roleAtLeast(have, need)` answers
// "does the acting role satisfy the required role?".
const ROLE_RANK: Record<Role, number> = {
  member: 0,
  admin: 1,
  owner: 2,
};

export const roleAtLeast = (role: Role, required: Role): boolean =>
  ROLE_RANK[role] >= ROLE_RANK[required];

export type Invoice = {
  id: string;
  orgId: string;
  number: string;
  customerName: string;
  status: InvoiceStatus;
  total: string;
  currency: string;
  createdAt: string;
  dueAt: string | null;
  deletedAt: string | null;
  archivedAt: string | null;
  version: number;
};

export type AuditLog = {
  id: string;
  orgId: string;
  actorUserId: string;
  action: string;
  subjectId: string;
  createdAt: string;
};

export type Organization = {
  id: string;
  name: string;
};

// The in-memory analogue of the `usage_quota_daily` table: one row per
// (userId, day) carrying the running token total for that UTC day.
export type UsageQuotaRow = {
  userId: string;
  day: string;
  tokensUsed: number;
  updatedAt: string;
};

// The in-memory analogue of the `llm_audit_events` table: one append-only row
// per agentic step (`llm.step`) or per finished conversation (`llm.finish`).
export type LlmAuditEvent = {
  id: string;
  userId: string;
  orgId: string;
  event: 'llm.step' | 'llm.finish';
  payload: Record<string, unknown>;
  createdAt: string;
};
