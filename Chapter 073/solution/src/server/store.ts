import 'server-only';

import type { AuditLog, Invoice, InvoiceStatus, Role } from '@/server/types';

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

// Mutable raw arrays. Reads must go through `scopedInvoices`; only the helper
// and the inspector's count/explainer panels may touch these directly.
export const invoices: Invoice[] = [];
export const auditLogs: AuditLog[] = [];

// ── Cache-layer store (chapter 073) ──────────────────────────────────────────
// These two are the DB-shaped artifacts of the cache lesson, translated onto the
// in-memory base. They behave identically to their SQL counterparts because
// Next.js Cache Components cache the *return value of a function*, not a query.

// The per-org aggregate row. This map IS the `org_invoice_summaries` table of
// the DB-backed framing. Empty after seed — the summary read's live fallback
// covers the empty state until the recompute job (or an action) writes a row.
export type OrgInvoiceSummary = {
  orgId: string;
  totalCount: number;
  totalAmount: number;
  updatedAt: string;
};

export const summaries = new Map<string, OrgInvoiceSummary>();

export const getSummaryRow = (orgId: string): OrgInvoiceSummary | undefined =>
  summaries.get(orgId);

export const upsertSummaryRow = (row: OrgInvoiceSummary): void => {
  summaries.set(row.orgId, row);
};

// The invalidation audit trail. This array IS the `cache_invalidation_log` table
// of the DB-backed framing. Each push gets a monotonically-increasing `seq` —
// that `seq` is the stable React `key` for the inspector log-tail rows (keying on
// the array index trips Biome's noArrayIndexKey, and same-millisecond pushes can
// collide on `firedAt`, so `seq` is the guaranteed-unique key).
export type CacheInvalidationEntry = {
  seq: number;
  tag: string;
  source: 'action' | 'job';
  firedAt: string;
};

export const invalidationLog: CacheInvalidationEntry[] = [];

let invalidationSeq = 0;

export const pushInvalidation = (
  tag: string,
  source: 'action' | 'job',
): void => {
  invalidationSeq += 1;
  invalidationLog.push({
    seq: invalidationSeq,
    tag,
    source,
    firedAt: new Date().toISOString(),
  });
};

// The deliberate failure-mode flag. The inspector's misuse toggle flips this; the
// `updateInvoice` action reads it to route the list tag through `revalidateTag`
// (the eventual primitive) where `updateTag` (read-your-writes) belongs. Held in
// a plain mutable object so it is shared across the page-render + action module
// graph. Production code NEVER reads a flag like this — it exists only as the
// teaching surface for the read-your-writes-vs-eventual distinction.
export const misuseFlag = { misuseRevalidateFromAction: false };

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

// Idempotent (re)seed — the inspector's "Reset and re-seed" calls this. Mutates
// the exported arrays in place so existing imports keep their reference.
export const reseed = (): void => {
  invoices.length = 0;
  invoices.push(...seedInvoices());
  auditLogs.length = 0;
  // Clear the cache-layer store too, so a reset returns every panel to zero.
  summaries.clear();
  invalidationLog.length = 0;
  invalidationSeq = 0;
  misuseFlag.misuseRevalidateFromAction = false;
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
