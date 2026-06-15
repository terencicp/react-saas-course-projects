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
  // Optional structured fields the canonical `logAudit(tx, event)` seam writes
  // (chapter 057 audit-log catalog). The invoice lineage leaves these unset.
  subjectType?: string;
  payload?: Record<string, unknown>;
};

// The org record carries the customer-facing plan label. Seeded so `/plan` paints
// deterministically and the plan-label mutation has a real column to write.
export type Organization = {
  id: string;
  name: string;
  planLabel: string;
};

// The per-org plan entitlement shape. The `/plan` overview surface reads this via
// the cached `getPlanEntitlement(orgId)`. Seeded deterministically so `/plan`
// paints the same row on every boot.
export type PlanEntitlement = {
  orgId: string;
  plan: string;
  seatsAllocated: number;
  seatsUsed: number;
  // ISO 8601 instant the current plan period renews. The renewal-countdown
  // block derives a day count from this.
  renewsAt: string;
};
