import { beforeEach, describe, expect, it, vi } from 'vitest';

// The query / scoped-query / store modules open with `import 'server-only'`, a
// Next.js build marker with no node resolution. Stub it to an empty module so
// the student's read layer loads in this node-env test exactly as it would
// inside an RSC bundle.
vi.mock('server-only', () => ({}));

import {
  getInvoiceDetail,
  type InvoiceSort,
  listInvoices,
} from '@/lib/invoices/queries';
import { scopedInvoices } from '@/lib/invoices/scoped-query';
import { invoices, reseed } from '@/server/store';
import type { Invoice, InvoiceStatus } from '@/server/types';

// The list query takes a fixed argument shape; spell out the non-lifecycle
// slice once so each test only varies `view` + `role`.
const listDefaults = {
  orgId: 'org-acme',
  status: null as InvoiceStatus | null,
  sort: '-createdAt' as InvoiceSort,
  q: '',
  cursor: null as string | null,
  // A page size that comfortably clears the 45 active org-acme rows, so the
  // seeded archived / deleted rows can't be hidden behind pagination.
  pageSize: 200,
};

// Pull the seeded lifecycle rows straight from the store, so the tests assert
// against the real seed shape rather than hard-coded ids.
const seededArchived = (): Invoice =>
  invoices.find(
    (inv) => inv.archivedAt !== null && inv.deletedAt === null,
  ) as Invoice;

const seededDeleted = (): Invoice =>
  invoices.find((inv) => inv.deletedAt !== null) as Invoice;

const idsOf = (rows: Invoice[]): string[] => rows.map((inv) => inv.id);

beforeEach(() => {
  // Reads don't mutate in this lesson, but reseed keeps the suite order-proof.
  reseed();
});

describe('Requirement 1 — the Active and Archived views return distinct, honest row sets', () => {
  it('the Archived view returns the seeded archived row and only archived rows', () => {
    const archived = seededArchived();
    const { rows } = listInvoices({
      ...listDefaults,
      view: 'archived',
      role: 'admin',
    });

    expect(
      idsOf(rows),
      'the Archived view must include the seeded archived row — check that archived() applies archivedFilter instead of returning the full org list',
    ).toContain(archived.id);

    const everyRowIsArchived = rows.every(
      (inv) => inv.archivedAt !== null && inv.deletedAt === null,
    );
    expect(
      everyRowIsArchived,
      'the Archived view leaked a non-archived or deleted row — archived() should keep only rows with archivedAt set and deletedAt null',
    ).toBe(true);
  });

  it('the Active view hides both the archived row and the soft-deleted row', () => {
    const archived = seededArchived();
    const deleted = seededDeleted();
    const { rows } = listInvoices({
      ...listDefaults,
      view: 'active',
      role: 'admin',
    });

    expect(
      idsOf(rows),
      'an archived row leaked into Active — active() should exclude rows with archivedAt set',
    ).not.toContain(archived.id);
    expect(
      idsOf(rows),
      'a soft-deleted row leaked into Active — active() should exclude rows with deletedAt set',
    ).not.toContain(deleted.id);

    const everyRowIsLive = rows.every(
      (inv) => inv.archivedAt === null && inv.deletedAt === null,
    );
    expect(
      everyRowIsLive,
      'the Active view returned an archived or deleted row — active() must apply activeFilter',
    ).toBe(true);
  });
});

describe('Requirement 2 — an admin All view returns every org row including the soft-deleted one', () => {
  it('includes the seeded soft-deleted row for an admin', () => {
    const deleted = seededDeleted();
    const { rows } = listInvoices({
      ...listDefaults,
      view: 'all',
      role: 'admin',
    });

    expect(
      idsOf(rows),
      'the admin All view omitted the soft-deleted row — view=all should route to includingDeleted() for an admin',
    ).toContain(deleted.id);
  });

  it('includes both the archived and active rows alongside the deleted one', () => {
    const archived = seededArchived();
    const { rows } = listInvoices({
      ...listDefaults,
      view: 'all',
      role: 'admin',
    });

    expect(
      idsOf(rows),
      'the admin All view should also contain archived rows — includingDeleted() returns the full org slice',
    ).toContain(archived.id);

    // Sanity: the full org slice is strictly larger than the active-only slice.
    const active = listInvoices({
      ...listDefaults,
      view: 'active',
      role: 'admin',
    }).rows;
    expect(
      rows.length,
      'the admin All view should hold more rows than Active (it adds the archived + deleted rows)',
    ).toBeGreaterThan(active.length);
  });
});

describe('Requirement 3 — view=all is refused to a member at the read', () => {
  it('serves a member active rows when they hand-type view=all', () => {
    const archived = seededArchived();
    const deleted = seededDeleted();
    const { rows } = listInvoices({
      ...listDefaults,
      view: 'all',
      role: 'member',
    });

    expect(
      idsOf(rows),
      'a member asking for view=all was shown the deleted row — resolveView must collapse all → active for non-admins',
    ).not.toContain(deleted.id);
    expect(
      idsOf(rows),
      'a member asking for view=all was shown the archived row — the RBAC gate must live in the read, not only the hidden tab',
    ).not.toContain(archived.id);

    // The refused member should see exactly the active set.
    const active = listInvoices({
      ...listDefaults,
      view: 'active',
      role: 'member',
    }).rows;
    expect(
      idsOf(rows).sort(),
      'a member with view=all should receive the active rows verbatim — resolveView collapses to active before the views are built',
    ).toEqual(idsOf(active).sort());
  });

  it('still serves an admin the full slice for view=all (the gate is role-scoped)', () => {
    const deleted = seededDeleted();
    const { rows } = listInvoices({
      ...listDefaults,
      view: 'all',
      role: 'admin',
    });
    expect(
      idsOf(rows),
      'the gate over-fired and hid the deleted row from an admin — only non-admins collapse all → active',
    ).toContain(deleted.id);
  });
});

describe('Requirement 4 — getInvoiceDetail loads lifecycle rows per role', () => {
  it('loads an archived invoice for a member (so it can be restored)', () => {
    const archived = seededArchived();
    const detail = getInvoiceDetail({
      orgId: 'org-acme',
      id: archived.id,
      role: 'member',
    });
    expect(
      detail?.id,
      'an archived invoice detail page must load for everyone so the row can be restored — check archived() is consulted in getInvoiceDetail',
    ).toBe(archived.id);
  });

  it('loads a soft-deleted invoice only for an admin', () => {
    const deleted = seededDeleted();

    const asAdmin = getInvoiceDetail({
      orgId: 'org-acme',
      id: deleted.id,
      role: 'admin',
    });
    expect(
      asAdmin?.id,
      'an admin must be able to open a soft-deleted invoice — getInvoiceDetail should fall through to includingDeleted() for admins',
    ).toBe(deleted.id);

    const asMember = getInvoiceDetail({
      orgId: 'org-acme',
      id: deleted.id,
      role: 'member',
    });
    expect(
      asMember,
      'a member must NOT be able to open a soft-deleted invoice — the includingDeleted() fallback is admin-gated',
    ).toBeNull();
  });
});

describe('Scoped helper — the three views are honestly distinct', () => {
  it('active(), archived(), and includingDeleted() partition the org slice correctly', () => {
    const scoped = scopedInvoices('org-acme');
    const archived = seededArchived();
    const deleted = seededDeleted();

    const big = Number.MAX_SAFE_INTEGER;
    const activeIds = idsOf(scoped.active().take(big));
    const archivedIds = idsOf(scoped.archived().take(big));
    const allIds = idsOf(scoped.includingDeleted().take(big));

    expect(
      activeIds,
      'active() still returns the archived row — it must filter archivedAt out',
    ).not.toContain(archived.id);
    expect(
      activeIds,
      'active() still returns the deleted row — it must filter deletedAt out',
    ).not.toContain(deleted.id);
    expect(
      archivedIds,
      'archived() must surface exactly the archived row',
    ).toEqual([archived.id]);
    expect(
      allIds,
      'includingDeleted() must return the whole org slice including the deleted row',
    ).toContain(deleted.id);
  });
});
