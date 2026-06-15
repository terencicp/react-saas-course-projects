import 'server-only';

import type {
  AuditLog,
  Invoice,
  InvoiceComment,
  InvoiceStatus,
  Role,
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
  name: string;
};

// Two orgs, two users each (an admin and a member). The session cookie names
// one of these identities (default `org-acme:admin`). The `name` is the
// display author for comments — the action and the optimistic row read it.
export const users: StoreUser[] = [
  { id: 'user-acme-admin', orgId: 'org-acme', role: 'admin', name: 'Ada Acme' },
  {
    id: 'user-acme-member',
    orgId: 'org-acme',
    role: 'member',
    name: 'Ben Acme',
  },
  {
    id: 'user-globex-admin',
    orgId: 'org-globex',
    role: 'admin',
    name: 'Gita Globex',
  },
  {
    id: 'user-globex-member',
    orgId: 'org-globex',
    role: 'member',
    name: 'Hank Globex',
  },
];

// Ch077 adds a Route Handler read seam and a Server Action write seam. The
// bundler emits those in separate module graphs, so plain module-level arrays
// would give each seam its own copy — an action's `pushComment`/`pushAudit`
// would be invisible to the route handler's read, and the post-settle refetch
// and the poll would never surface the write (R6/R9 fail). One `globalThis`
// holder makes the in-memory singleton survive the bundle split.
type StoreData = {
  invoices: Invoice[];
  auditLogs: AuditLog[];
  invoiceComments: InvoiceComment[];
};

const holder = globalThis as typeof globalThis & {
  __invoiceStore?: StoreData;
};

holder.__invoiceStore ??= {
  invoices: [],
  auditLogs: [],
  invoiceComments: [],
};

const store: StoreData = holder.__invoiceStore;

// Reads must go through `scopedInvoices`; only the helper and the inspector's
// count/explainer panels may touch these directly. They are getters off the
// `globalThis`-backed `store` so every importer — across both module graphs —
// sees the same arrays.
export const invoices = store.invoices;
export const auditLogs = store.auditLogs;
export const invoiceComments = store.invoiceComments;

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
const MINUTE = 60 * 1000;

// The focal invoice per org — the one seeded with a deep comment thread so the
// `maxPages: 10` cap (at `pageSize: 20`, 200 rows) is reachable.
const FOCAL_INVOICE: Record<string, string> = {
  'org-acme': 'inv-0001',
  'org-globex': 'glx-0001',
};

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

// Seed 240 comments on each org's focal invoice, alternating between the org's
// two seeded authors. 240 > 200 (the `maxPages: 10` × `pageSize: 20` window),
// so the page cap is reachable and "Load older" never hits "End of thread"
// before page 10 (R5). `createdAt` strides one minute back per row so the
// `(createdAt,id)` keyset cursor is strictly ordered.
const COMMENT_BODIES = [
  'Confirmed the totals with the customer on the phone.',
  'Waiting on the PO number before we send this out.',
  'Customer disputes line 3 — flagged for review.',
  'Updated the billing contact after the merger.',
  'Reconciled against the bank export, all good.',
  'Pushed the due date out a week per the email thread.',
  'Heads up: this account is on a net-60 term now.',
  'Re-issued after fixing the currency on the second line.',
];

const seedComments = (): InvoiceComment[] => {
  const rows: InvoiceComment[] = [];

  for (const [orgId, invoiceId] of Object.entries(FOCAL_INVOICE)) {
    const authors = users.filter((u) => u.orgId === orgId);
    const [first, second] = authors;
    if (!first || !second) {
      continue;
    }

    for (let i = 0; i < 240; i++) {
      const author = i % 2 === 0 ? first : second;
      // Newest first: index 0 is the most recent, striding one minute back.
      const createdAt = new Date(ANCHOR - i * MINUTE).toISOString();
      rows.push({
        id: `cmt-${invoiceId}-${String(i).padStart(4, '0')}`,
        orgId,
        invoiceId,
        authorId: author.id,
        authorName: author.name,
        body: `${COMMENT_BODIES[i % COMMENT_BODIES.length]} (#${i + 1})`,
        createdAt,
      });
    }
  }

  return rows;
};

// Idempotent (re)seed — the inspector's "Reset and re-seed" calls this. Mutates
// the `globalThis`-backed arrays in place so existing imports keep their
// reference (and both module graphs stay pointed at the same data).
export const reseed = (): void => {
  invoices.length = 0;
  invoices.push(...seedInvoices());
  auditLogs.length = 0;
  invoiceComments.length = 0;
  invoiceComments.push(...seedComments());
};

// Seed deterministically on first import.
reseed();

export const findInvoice = (orgId: string, id: string): Invoice | undefined =>
  invoices.find((inv) => inv.orgId === orgId && inv.id === id);

export const findUser = (id: string): StoreUser | undefined =>
  users.find((u) => u.id === id);

let auditSeq = 0;

export const pushAudit = (entry: Omit<AuditLog, 'id' | 'createdAt'>): void => {
  auditSeq += 1;
  auditLogs.push({
    id: `audit-${String(auditSeq).padStart(5, '0')}`,
    createdAt: new Date().toISOString(),
    ...entry,
  });
};

let commentSeq = 0;

// Append a comment authored now. Returns the persisted row so the action can
// echo `{ id, createdAt }` back to the client mutation.
export const pushComment = (
  entry: Omit<InvoiceComment, 'id' | 'createdAt'>,
): InvoiceComment => {
  commentSeq += 1;
  const row: InvoiceComment = {
    id: `cmt-new-${String(commentSeq).padStart(5, '0')}`,
    // Just ahead of the seed anchor so a fresh comment sorts to the very top.
    createdAt: new Date(ANCHOR + (commentSeq + 1) * MINUTE).toISOString(),
    ...entry,
  };
  invoiceComments.push(row);
  return row;
};

// Insert a comment authored by the *other* seeded user in the org — the
// inspector's "Insert coworker comment" button calls this. It does NOT update
// any tag; the client poll is what surfaces it (R6).
export const insertCoworkerComment = (
  orgId: string,
  invoiceId: string,
): InvoiceComment | undefined => {
  const orgUsers = users.filter((u) => u.orgId === orgId);
  // The "coworker" is the member when the actor is the admin, and vice versa —
  // here we just pick the member as the coworker voice.
  const coworker = orgUsers.find((u) => u.role === 'member') ?? orgUsers[0];
  if (!coworker) {
    return undefined;
  }
  return pushComment({
    orgId,
    invoiceId,
    authorId: coworker.id,
    authorName: coworker.name,
    body: 'Just looked this over — looks right to me.',
  });
};

export type ListCommentsPageArgs = {
  orgId: string;
  invoiceId: string;
  cursor: string | null;
  pageSize: number;
};

export type CommentsStorePage = {
  comments: InvoiceComment[];
  nextCursor: string | null;
  prevCursor: string | null;
};

// A `(createdAt,id)` keyset cursor, base64url-encoded. Ordering is
// `createdAt desc, id desc`, so a row sorts before another when its
// `(createdAt,id)` tuple is greater.
const encodeCursor = (row: InvoiceComment): string =>
  Buffer.from(`${row.createdAt}|${row.id}`, 'utf8').toString('base64url');

const decodeCursor = (
  cursor: string,
): { createdAt: string; id: string } | null => {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = raw.lastIndexOf('|');
    if (sep < 0) {
      return null;
    }
    return { createdAt: raw.slice(0, sep), id: raw.slice(sep + 1) };
  } catch {
    return null;
  }
};

// Strictly "is `a` newer than `b`" under `createdAt desc, id desc`.
const isAfter = (
  a: { createdAt: string; id: string },
  b: { createdAt: string; id: string },
): boolean => {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt > b.createdAt;
  }
  return a.id > b.id;
};

// Tenant-scoped, keyset-paged read over the comment store. Rows still carry
// `orgId` here; `queries.ts` projects it off for the wire shape.
export const listCommentsPage = ({
  orgId,
  invoiceId,
  cursor,
  pageSize,
}: ListCommentsPageArgs): CommentsStorePage => {
  const scoped = invoiceComments
    .filter((c) => c.orgId === orgId && c.invoiceId === invoiceId)
    .sort((a, b) => (isAfter(a, b) ? -1 : isAfter(b, a) ? 1 : 0));

  const decoded = cursor ? decodeCursor(cursor) : null;
  const after = decoded
    ? scoped.filter((c) =>
        isAfter(decoded, { createdAt: c.createdAt, id: c.id }),
      )
    : scoped;

  // Take `pageSize + 1` to detect whether an older page exists.
  const slice = after.slice(0, pageSize + 1);
  const hasMore = slice.length > pageSize;
  const comments = hasMore ? slice.slice(0, pageSize) : slice;

  const last = comments[comments.length - 1];
  const first = comments[0];

  return {
    comments,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
    prevCursor: first ? encodeCursor(first) : null,
  };
};
