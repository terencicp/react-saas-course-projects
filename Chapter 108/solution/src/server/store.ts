import 'server-only';

import type {
  AuditLog,
  Invoice,
  InvoiceStatus,
  LlmAuditEvent,
  Organization,
  Role,
  UsageQuotaRow,
} from '@/server/types';

// This module is the "Postgres" of the project: a single in-memory singleton
// that every read goes through `scopedInvoices(orgId)` and every write mutates
// via the actions. No randomness that drifts across boots — fixed seed values,
// ISO `createdAt` strings descending, stable ids. The render pipeline boots
// `pnpm dev` with no Docker/Postgres/auth, so the data must be deterministic.

export type StoreUser = {
  id: string;
  orgId: string;
  role: Role;
};

// Two orgs, two users each (an admin and a member). The session cookie names
// one of these identities (default `org-acme:admin`).
export const users: StoreUser[] = [
  { id: 'user-acme-admin', orgId: 'org-acme', role: 'admin' },
  { id: 'user-acme-member', orgId: 'org-acme', role: 'member' },
  { id: 'user-globex-admin', orgId: 'org-globex', role: 'admin' },
  { id: 'user-globex-member', orgId: 'org-globex', role: 'member' },
];

// The orgs, by id — the route's `ctx.db` facade reads the display name from
// here so the system prompt can name the org.
export const organizations: Organization[] = [
  { id: 'org-acme', name: 'Acme Inc.' },
  { id: 'org-globex', name: 'Globex Corporation' },
];

// Mutable raw arrays. Reads must go through `scopedInvoices`; only the helper
// and the inspector's count/explainer panels may touch these directly.
export const invoices: Invoice[] = [];
export const auditLogs: AuditLog[] = [];

// The two LLM "tables": the in-memory analogue of `usage_quota_daily` and
// `llm_audit_events`. Read directly only by the `lib/llm` quota/audit helpers
// and the inspector — the same rule `scopedInvoices` enforces for invoices.
export const usageQuota: UsageQuotaRow[] = [];
export const llmAuditEvents: LlmAuditEvent[] = [];

const STATUSES: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue'];
const CUSTOMERS = [
  'Acme Northwind',
  'Globex Holdings',
  'Initech Labs',
  'Umbrella Retail',
  'Stark Industries',
  'Wayne Foods',
  'Hooli Cloud',
  'Pied Piper',
  'Soylent Co',
  'Cyberdyne Systems',
];

// A fixed anchor date so `createdAt` strings never drift across boots.
const ANCHOR = Date.parse('2026-05-01T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const seedInvoices = (): Invoice[] => {
  const rows: Invoice[] = [];

  // 45 active invoices for org-acme, `createdAt` descending (inv-0001 newest).
  for (let i = 1; i <= 45; i++) {
    const id = `inv-${String(i).padStart(4, '0')}`;
    const createdAt = new Date(ANCHOR - (i - 1) * DAY).toISOString();
    rows.push({
      id,
      orgId: 'org-acme',
      number: `ACME-${String(1000 + i)}`,
      customerName: CUSTOMERS[i % CUSTOMERS.length] ?? 'Acme Northwind',
      status: STATUSES[i % STATUSES.length] ?? 'draft',
      total: `${(120 + i * 13.5).toFixed(2)}`,
      currency: 'USD',
      createdAt,
      dueAt: new Date(ANCHOR - (i - 1) * DAY + 30 * DAY).toISOString(),
      deletedAt: null,
      archivedAt: null,
      version: 1,
    });
  }

  // One pre-archived row (its own id) for the Archived view + restore demo.
  // Dated just after the anchor so under the default `-createdAt` sort it lands
  // on the first page of the All view (where the archived badge must be visible).
  rows.push({
    id: 'inv-archived-1',
    orgId: 'org-acme',
    number: 'ACME-2001',
    customerName: 'Initech Labs',
    status: 'sent',
    total: '980.00',
    currency: 'USD',
    createdAt: new Date(ANCHOR + 1 * DAY).toISOString(),
    dueAt: new Date(ANCHOR - 30 * DAY).toISOString(),
    deletedAt: null,
    archivedAt: new Date(ANCHOR - 5 * DAY).toISOString(),
    version: 2,
  });

  // One pre-soft-deleted row. Its `number` equals a live row's `number`
  // (ACME-1001 == inv-0001's number) to demonstrate that a partial unique index
  // on `number WHERE deleted_at IS NULL` lets the number be re-used — the
  // colliding rows have different ids. Dated just after the anchor so it lands
  // on the first page of the All view (where the deleted badge must be visible).
  rows.push({
    id: 'inv-deleted-1',
    orgId: 'org-acme',
    number: 'ACME-1001',
    customerName: 'Umbrella Retail',
    status: 'overdue',
    total: '430.00',
    currency: 'USD',
    createdAt: new Date(ANCHOR + 2 * DAY).toISOString(),
    dueAt: new Date(ANCHOR - 40 * DAY).toISOString(),
    deletedAt: new Date(ANCHOR - 3 * DAY).toISOString(),
    archivedAt: null,
    version: 3,
  });

  // A few rows for org-globex so the tenant boundary is observable.
  for (let i = 1; i <= 6; i++) {
    const id = `glx-${String(i).padStart(4, '0')}`;
    const createdAt = new Date(ANCHOR - (i - 1) * DAY).toISOString();
    rows.push({
      id,
      orgId: 'org-globex',
      number: `GLX-${String(2000 + i)}`,
      customerName: CUSTOMERS[(i + 3) % CUSTOMERS.length] ?? 'Globex Holdings',
      status: STATUSES[i % STATUSES.length] ?? 'draft',
      total: `${(200 + i * 11).toFixed(2)}`,
      currency: 'USD',
      createdAt,
      dueAt: new Date(ANCHOR - (i - 1) * DAY + 30 * DAY).toISOString(),
      deletedAt: null,
      archivedAt: null,
      version: 1,
    });
  }

  return rows;
};

// Today / yesterday as ISO `YYYY-MM-DD` in UTC — the daily-quota key. UTC so the
// key never drifts with the machine's timezone (the same date everywhere).
export const todayUtc = (): string => new Date().toISOString().slice(0, 10);

const yesterdayUtc = (): string =>
  new Date(Date.now() - DAY).toISOString().slice(0, 10);

// Sequence counter for `pushLlmAuditEvent` ids — declared before `reseed` (which
// resets it) so the module-eval-time `reseed()` call below does not hit its TDZ.
let llmAuditSeq = 0;

// Idempotent (re)seed — the inspector's "Reset and re-seed" calls this. Mutates
// the exported arrays in place so existing imports keep their reference.
export const reseed = (): void => {
  invoices.length = 0;
  invoices.push(...seedInvoices());
  auditLogs.length = 0;

  // Seed the quota table near the cap for `user-acme-member` so a couple of
  // questions cross the 100k daily cap deterministically (the unhappy 429 path
  // is reachable by hand without spending money). A "yesterday" near-cap row for
  // the same user proves the daily key resets — today's row starts independent.
  usageQuota.length = 0;
  usageQuota.push(
    {
      userId: 'user-acme-member',
      day: todayUtc(),
      tokensUsed: 90_000,
      updatedAt: new Date(ANCHOR).toISOString(),
    },
    {
      userId: 'user-acme-member',
      day: yesterdayUtc(),
      tokensUsed: 99_000,
      updatedAt: new Date(ANCHOR - DAY).toISOString(),
    },
  );

  llmAuditEvents.length = 0;
  llmAuditSeq = 0;
};

// Seed deterministically on first import.
reseed();

export const findInvoice = (orgId: string, id: string): Invoice | undefined =>
  invoices.find((inv) => inv.orgId === orgId && inv.id === id);

let auditSeq = 0;

export const pushAudit = (entry: Omit<AuditLog, 'id' | 'createdAt'>): void => {
  auditSeq += 1;
  auditLogs.push({
    id: `audit-${String(auditSeq).padStart(5, '0')}`,
    createdAt: new Date().toISOString(),
    ...entry,
  });
};

// The one sanctioned lookup into `usageQuota` (the quota helpers read through
// this, the inspector reads it for the live counter). Returns undefined when the
// (userId, day) row has not been created yet.
export const findQuotaRow = (
  userId: string,
  day: string,
): UsageQuotaRow | undefined =>
  usageQuota.find((row) => row.userId === userId && row.day === day);

// Append-only push into `llmAuditEvents`, sequential id like `pushAudit`. The
// `lib/llm` audit writers are the only callers.
export const pushLlmAuditEvent = (
  entry: Omit<LlmAuditEvent, 'id' | 'createdAt'>,
): void => {
  llmAuditSeq += 1;
  llmAuditEvents.push({
    id: `llm-${String(llmAuditSeq).padStart(5, '0')}`,
    createdAt: new Date().toISOString(),
    ...entry,
  });
};
