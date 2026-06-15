import 'server-only';

import type { Locale } from '@/lib/i18n/supported';
import {
  instantFromString,
  plainDateFromString,
  type Temporal,
} from '@/lib/temporal';
import type { AuditLog, Invoice, InvoiceStatus, Role } from '@/server/types';

// This module is the project's "Postgres": a single in-memory singleton that
// every read goes through `scopedInvoices(orgId)` and every write mutates via the
// actions. Fixed seed values, no drift across boots, stable ids — so the surface
// renders under `pnpm dev` with no Docker/Postgres/auth. `createdAt` rows are
// real `Temporal.Instant`s and `dueDate` real `Temporal.PlainDate`s so the
// DST-spanning fixtures render genuinely DST-aware wall-clock.

export type StoreUser = {
  id: string;
  orgId: string;
  role: Role;
  // The viewer's BCP 47 locale and IANA timezone. Independent of each other —
  // the last pairing below deliberately mixes fr-FR with Pacific/Auckland.
  locale: Locale;
  timeZone: string;
};

// Two orgs, two users each. Four (locale, tz) pairs across them; the session
// cookie names one of these identities (default `org-acme:admin`).
export const users: StoreUser[] = [
  {
    id: 'user-acme-admin',
    orgId: 'org-acme',
    role: 'admin',
    locale: 'en-US',
    timeZone: 'America/New_York',
  },
  {
    id: 'user-acme-member',
    orgId: 'org-acme',
    role: 'member',
    locale: 'en-GB',
    timeZone: 'Europe/London',
  },
  {
    id: 'user-globex-admin',
    orgId: 'org-globex',
    role: 'admin',
    locale: 'fr-FR',
    timeZone: 'Europe/Paris',
  },
  {
    id: 'user-globex-member',
    orgId: 'org-globex',
    role: 'member',
    // Locale and tz are independent: a French viewer sitting in New Zealand.
    locale: 'fr-FR',
    timeZone: 'Pacific/Auckland',
  },
];

// Mutable raw arrays. Reads must go through `scopedInvoices`; only the helper and
// the inspector's count/explainer panels may touch these directly.
export const invoices: Invoice[] = [];
export const auditLogs: AuditLog[] = [];

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

// A USD/GBP/EUR mix so the currency-from-data path is exercised: each row's
// currency is its own, formatted for the viewer's locale.
const CURRENCIES = ['USD', 'GBP', 'EUR'];

// Fixed anchor moment so seeded instants never drift across boots.
const ANCHOR = instantFromString('2026-05-01T12:00:00Z');
const DAY_SECONDS = 24 * 60 * 60;

// Shift an Instant by N days (negative = earlier).
const shiftDays = (instant: Temporal.Instant, days: number): Temporal.Instant =>
  instant.add({ seconds: days * DAY_SECONDS });

// The PlainDate due day for a created Instant: 30 calendar days later, read in
// UTC (the due date is zone-independent).
const dueFor = (created: Temporal.Instant): Temporal.PlainDate =>
  created.toZonedDateTimeISO('UTC').toPlainDate().add({ days: 30 });

const seedOrg = (orgId: string, prefix: string, count: number): Invoice[] => {
  const rows: Invoice[] = [];
  for (let i = 1; i <= count; i++) {
    const id = `${prefix}-${String(i).padStart(4, '0')}`;
    const createdAt = shiftDays(ANCHOR, -(i - 1));
    // A repeatable amount in minor units; varies per row, three currencies.
    const amountMinor = 123_456 + i * 1357;
    rows.push({
      id,
      orgId,
      number: `${prefix.toUpperCase()}-${String(1000 + i)}`,
      customerName: CUSTOMERS[i % CUSTOMERS.length] ?? 'Acme Northwind',
      status: STATUSES[i % STATUSES.length] ?? 'draft',
      amountMinor,
      total: (amountMinor / 100).toFixed(2),
      currency: CURRENCIES[i % CURRENCIES.length] ?? 'USD',
      createdAt,
      dueDate: dueFor(createdAt),
      deletedAt: null,
      archivedAt: null,
      version: 1,
    });
  }
  return rows;
};

const seedInvoices = (): Invoice[] => {
  // ~30 active invoices per org with a USD/GBP/EUR mix.
  const rows: Invoice[] = [
    ...seedOrg('org-acme', 'inv', 30),
    ...seedOrg('org-globex', 'glx', 30),
  ];

  // The two DST-spanning fixtures the inspector's DST panel targets: identical
  // UTC offset (18:00Z), different London wall-clock. In Europe/London,
  // 2026-07-01T18:00:00Z is 7:00 PM BST; 2026-01-01T18:00:00Z is 6:00 PM GMT.
  const dstSummer = instantFromString('2026-07-01T18:00:00Z');
  const dstWinter = instantFromString('2026-01-01T18:00:00Z');
  rows.push({
    id: 'inv-dst-summer',
    orgId: 'org-acme',
    number: 'ACME-7001',
    customerName: 'Stark Industries',
    status: 'sent',
    amountMinor: 250_000,
    total: '2500.00',
    currency: 'GBP',
    createdAt: dstSummer,
    dueDate: dueFor(dstSummer),
    deletedAt: null,
    archivedAt: null,
    version: 1,
  });
  rows.push({
    id: 'inv-dst-winter',
    orgId: 'org-acme',
    number: 'ACME-1101',
    customerName: 'Wayne Foods',
    status: 'paid',
    amountMinor: 180_000,
    total: '1800.00',
    currency: 'GBP',
    createdAt: dstWinter,
    dueDate: dueFor(dstWinter),
    deletedAt: null,
    archivedAt: null,
    version: 1,
  });

  // One pre-archived row (for the Archived view + restore demo). Dated just
  // after the anchor so under the default `-createdAt` sort it lands on the
  // first page of the All view (where the archived badge must be visible).
  const archivedCreated = shiftDays(ANCHOR, 1);
  rows.push({
    id: 'inv-archived-1',
    orgId: 'org-acme',
    number: 'ACME-2001',
    customerName: 'Initech Labs',
    status: 'sent',
    amountMinor: 98_000,
    total: '980.00',
    currency: 'EUR',
    createdAt: archivedCreated,
    dueDate: plainDateFromString('2026-04-01'),
    deletedAt: null,
    archivedAt: new Date(
      ANCHOR.epochMilliseconds - 5 * 86_400_000,
    ).toISOString(),
    version: 2,
  });

  // One pre-soft-deleted row. Its `number` equals a live row's (ACME-1001 ==
  // inv-0001's) to show that a partial unique index on `number WHERE deleted_at
  // IS NULL` lets the number be re-used. Dated just after the anchor so it lands
  // on the first page of the All view (where the deleted badge must be visible).
  const deletedCreated = shiftDays(ANCHOR, 2);
  rows.push({
    id: 'inv-deleted-1',
    orgId: 'org-acme',
    number: 'ACME-1001',
    customerName: 'Umbrella Retail',
    status: 'overdue',
    amountMinor: 43_000,
    total: '430.00',
    currency: 'USD',
    createdAt: deletedCreated,
    dueDate: plainDateFromString('2026-03-22'),
    deletedAt: new Date(
      ANCHOR.epochMilliseconds - 3 * 86_400_000,
    ).toISOString(),
    archivedAt: null,
    version: 3,
  });

  return rows;
};

// Idempotent (re)seed — the inspector's "Reset and re-seed" calls this. Mutates
// the exported arrays in place so existing imports keep their reference.
export const reseed = (): void => {
  invoices.length = 0;
  invoices.push(...seedInvoices());
  auditLogs.length = 0;
};

// Seed deterministically on first import.
reseed();

export const findInvoice = (orgId: string, id: string): Invoice | undefined =>
  invoices.find((inv) => inv.orgId === orgId && inv.id === id);

// Update a store user's profile locale — the switch action writes both this and
// the `NEXT_LOCALE` cookie so the session and the URL agree.
export const setUserLocale = (userId: string, locale: Locale): void => {
  const user = users.find((u) => u.id === userId);
  if (user) {
    user.locale = locale;
  }
};

// Update a store user's profile timezone — the inspector's locale/tz override
// panel writes this so the DST panel re-renders in the chosen zone.
export const setUserTimeZone = (userId: string, timeZone: string): void => {
  const user = users.find((u) => u.id === userId);
  if (user) {
    user.timeZone = timeZone;
  }
};

let auditSeq = 0;

export const pushAudit = (entry: Omit<AuditLog, 'id' | 'createdAt'>): void => {
  auditSeq += 1;
  auditLogs.push({
    id: `audit-${String(auditSeq).padStart(5, '0')}`,
    createdAt: new Date().toISOString(),
    ...entry,
  });
};
