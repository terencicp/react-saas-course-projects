import type { Locale } from '@/lib/i18n/supported';
import type { Temporal } from '@/lib/temporal';

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
  // `amountMinor` is the integer minor units (cents); divide by 100 only at
  // display so `format.number(..., { style: 'currency', currency })` is honest.
  amountMinor: number;
  // `total` is the ch062 baseline display string the carry-in cells still read
  // until S2 swaps them to the `amountMinor`/`currency` formatter path.
  total: string;
  // ISO 4217 currency code carried as data on the row — the format follows the
  // viewer's locale, but the currency is the invoice's own.
  currency: string;
  // A moment in time. `Instant` is zone-independent; the wall-clock is decided
  // at the formatter call site by the viewer's profile `timeZone`.
  createdAt: Temporal.Instant;
  // A calendar day. `PlainDate` carries no zone, so the due date never shifts
  // across the viewer's timezone.
  dueDate: Temporal.PlainDate;
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

// The profile fields the i18n surface reads off the session: an IANA timezone
// and a BCP 47 locale, independent of each other (a fr-FR viewer can sit in
// Pacific/Auckland).
export type UserProfile = {
  locale: Locale;
  timeZone: string;
};
