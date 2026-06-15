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

// A customer row, written by the "new customer" wizard's Server Action. Every
// field is a string except `notificationChannels` (the preferences slice's
// multi-select). The wizard re-parses its composite payload at the boundary,
// so the row is always fully populated before it lands here.
export type Customer = {
  id: string;
  orgId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  taxId: string;
  paymentTerms: string;
  defaultCurrency: string;
  language: string;
  notificationChannels: string[];
  createdAt: string;
};
