import 'server-only';

import type {
  AuditLog,
  Customer,
  Invoice,
  InvoiceStatus,
  Role,
} from '@/server/types';

// This module is the "Postgres" of the project: a single in-memory singleton
// that every read and write goes through. No randomness that drifts across
// boots — fixed seed values, ISO `createdAt` strings, stable ids. The render
// pipeline boots `pnpm dev` with no Docker/Postgres/auth, so the data must be
// deterministic.
//
// The arrays are backed by `globalThis` rather than module scope: the wizard
// adds a Server Action write graph that is bundled separately from the RSC read
// graph. A plain module-level array would give each graph its own copy, so the
// action's write would be invisible to the customers-list and inspector reads.
// Pinning the holder on `globalThis` keeps one shared instance across both.

export type StoreUser = {
  id: string;
  orgId: string;
  role: Role;
};

type AppStore = {
  users: StoreUser[];
  invoices: Invoice[];
  auditLogs: AuditLog[];
  customers: Customer[];
};

// Two orgs, two users each (an admin and a member). The session cookie names
// one of these identities (default `org-acme:admin`).
const seedUsers = (): StoreUser[] => [
  { id: 'user-acme-admin', orgId: 'org-acme', role: 'admin' },
  { id: 'user-acme-member', orgId: 'org-acme', role: 'member' },
  { id: 'user-globex-admin', orgId: 'org-globex', role: 'admin' },
  { id: 'user-globex-member', orgId: 'org-globex', role: 'member' },
];

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

  for (let i = 1; i <= 6; i++) {
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

  return rows;
};

// Fixed customer field values, indexed by seed position so every row is
// deterministic. The first org-acme row's email is reused as the wizard's
// duplicate-conflict target: submitting `dupe@acme.test` again makes
// `pushCustomer` throw the `{ code: '23505' }`-shaped error.
const FIRST_NAMES = [
  'Ada',
  'Grace',
  'Alan',
  'Katherine',
  'Linus',
  'Margaret',
  'Dennis',
  'Barbara',
];
const LAST_NAMES = [
  'Lovelace',
  'Hopper',
  'Turing',
  'Johnson',
  'Torvalds',
  'Hamilton',
  'Ritchie',
  'Liskov',
];
const CITIES = [
  'Portland',
  'Austin',
  'Denver',
  'Seattle',
  'Boston',
  'Chicago',
  'Miami',
  'Phoenix',
];
const REGIONS = ['OR', 'TX', 'CO', 'WA', 'MA', 'IL', 'FL', 'AZ'];
const PAYMENT_TERMS = ['net15', 'net30', 'net60'];
const LANGUAGES = ['en-US', 'en-GB', 'fr-FR'];

const seedCustomersFor = (orgId: string, prefix: string): Customer[] => {
  const rows: Customer[] = [];
  for (let i = 0; i < 8; i++) {
    const id = `cust-${prefix}-${String(i + 1).padStart(4, '0')}`;
    const firstName = FIRST_NAMES[i] ?? 'Sam';
    const lastName = LAST_NAMES[i] ?? 'Smith';
    // The first org-acme row owns the duplicate-conflict email.
    const email =
      orgId === 'org-acme' && i === 0
        ? 'dupe@acme.test'
        : `${(firstName ?? 'sam').toLowerCase()}.${(
            lastName ?? 'smith'
          ).toLowerCase()}@${prefix}.test`;
    rows.push({
      id,
      orgId,
      firstName,
      lastName,
      email,
      phone: `555-01${String(10 + i).padStart(2, '0')}`,
      line1: `${100 + i} Main Street`,
      line2: i % 2 === 0 ? `Suite ${i + 1}` : '',
      city: CITIES[i] ?? 'Portland',
      region: REGIONS[i] ?? 'OR',
      postalCode: String(97000 + i),
      country: 'US',
      taxId: `TAX-${prefix.toUpperCase()}-${String(i + 1).padStart(4, '0')}`,
      paymentTerms: PAYMENT_TERMS[i % PAYMENT_TERMS.length] ?? 'net30',
      defaultCurrency: 'USD',
      language: LANGUAGES[i % LANGUAGES.length] ?? 'en-US',
      notificationChannels: i % 2 === 0 ? ['email'] : ['email', 'inApp'],
      createdAt: new Date(ANCHOR - i * DAY).toISOString(),
    });
  }
  return rows;
};

const seedCustomers = (): Customer[] => [
  ...seedCustomersFor('org-acme', 'acme'),
  ...seedCustomersFor('org-globex', 'globex'),
];

// Pin the store holder on `globalThis`. Write the lazy init as a statement and
// read the holder on the next line — not as an inline `(holder.__appStore ??=
// {…}).customers` expression: Biome 2.4's `noAssignInExpressions` rejects an
// assignment used as an expression, and it is default-on so `biome ci` fails.
const holder = globalThis as typeof globalThis & {
  __appStore?: AppStore;
};

holder.__appStore ??= {
  users: seedUsers(),
  invoices: seedInvoices(),
  auditLogs: [],
  customers: seedCustomers(),
};

const store = holder.__appStore;

// Mutable raw arrays. The list/detail queries read these through their own
// `orgId` filter; the inspector's panels may touch them directly.
export const users = store.users;
export const invoices = store.invoices;
export const auditLogs = store.auditLogs;
export const customers = store.customers;

// Idempotent (re)seed — the inspector's "Reset store" calls this. Mutates the
// arrays in place so existing imports keep their reference.
export const reseed = (): void => {
  users.length = 0;
  users.push(...seedUsers());
  invoices.length = 0;
  invoices.push(...seedInvoices());
  auditLogs.length = 0;
  customers.length = 0;
  customers.push(...seedCustomers());
  auditSeq = 0;
  customerSeq = 0;
};

export const findInvoice = (orgId: string, id: string): Invoice | undefined =>
  invoices.find((inv) => inv.orgId === orgId && inv.id === id);

export const findCustomer = (orgId: string, id: string): Customer | undefined =>
  customers.find((c) => c.orgId === orgId && c.id === id);

let auditSeq = 0;

export const pushAudit = (entry: Omit<AuditLog, 'id' | 'createdAt'>): void => {
  auditSeq += 1;
  auditLogs.push({
    id: `audit-${String(auditSeq).padStart(5, '0')}`,
    createdAt: new Date().toISOString(),
    ...entry,
  });
};

let customerSeq = 0;

// Insert a new customer. Generates the id + ISO `createdAt`, pushes the row, and
// returns it. Throws a `{ code: '23505' }`-shaped error when `(orgId, email)`
// already exists — the same shape a Postgres unique-violation would raise — so
// the wizard action's conflict branch is reachable.
export const pushCustomer = (
  entry: Omit<Customer, 'id' | 'createdAt'>,
): Customer => {
  const exists = customers.some(
    (c) => c.orgId === entry.orgId && c.email === entry.email,
  );
  if (exists) {
    throw Object.assign(new Error('duplicate customer email'), {
      code: '23505',
    });
  }
  customerSeq += 1;
  const row: Customer = {
    id: `cust-new-${String(customerSeq).padStart(4, '0')}`,
    createdAt: new Date().toISOString(),
    ...entry,
  };
  customers.push(row);
  return row;
};
