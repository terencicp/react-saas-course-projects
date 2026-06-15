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
