import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Environment shims -------------------------------------------------------
//
// The lifecycle actions run as Server Actions: `authedAction` resolves the
// session through `next/headers` cookies, and each action calls
// `revalidatePath` from `next/cache`. Neither resolves in a node-env test, so
// stub both with the minimum surface the actions touch. `server-only` is a
// build marker with no node resolution — stub it to an empty module so the
// store / action modules load exactly as they would inside a server bundle.
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

// A mutable cookie value the test controls. `actAs(identity)` points the
// session at a seeded `<orgId>:<role>` identity before invoking an action,
// which is how the action's RBAC + tenancy ctx is driven.
let actingIdentity = 'org-acme:admin';
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'acting-identity' ? { value: actingIdentity } : undefined,
  }),
}));

const actAs = (identity: string) => {
  actingIdentity = identity;
};

import {
  archiveInvoice,
  restoreInvoice,
  softDeleteInvoice,
} from '@/lib/invoices/actions';
import { auditLogs, findInvoice, invoices, reseed } from '@/server/store';
import type { Invoice } from '@/server/types';

// Build the `id`+`version` FormData the row menu would submit. The wrapper
// coerces the string `version` back to a number — FormData is always strings.
const lifecycleFormData = (row: { id: string; version: number }): FormData => {
  const fd = new FormData();
  fd.set('id', row.id);
  fd.set('version', String(row.version));
  return fd;
};

// Pull seeded rows straight from the store so the tests assert against the real
// seed shape rather than hard-coded ids.
const anActiveRow = (): Invoice =>
  invoices.find(
    (inv) =>
      inv.orgId === 'org-acme' &&
      inv.archivedAt === null &&
      inv.deletedAt === null,
  ) as Invoice;

const seededArchived = (): Invoice =>
  invoices.find(
    (inv) => inv.archivedAt !== null && inv.deletedAt === null,
  ) as Invoice;

const seededDeleted = (): Invoice =>
  invoices.find((inv) => inv.deletedAt !== null) as Invoice;

const auditCountFor = (subjectId: string): number =>
  auditLogs.filter((log) => log.subjectId === subjectId).length;

beforeEach(() => {
  // Each action mutates the store; reseed keeps the suite order-proof.
  reseed();
  actAs('org-acme:admin');
});

describe('Requirement 1 — archiving moves a row from Active to Archived', () => {
  it('archive sets archivedAt, bumps version, and leaves the row in the archived set', async () => {
    const row = anActiveRow();
    const before = row.version;

    const result = await archiveInvoice(null, lifecycleFormData(row));

    expect(
      result.ok,
      'archiveInvoice returned a failure for a clean active row — it should set archivedAt and return ok(row). Check the archive() body still has its stub return.',
    ).toBe(true);

    const stored = findInvoice('org-acme', row.id) as Invoice;
    expect(
      stored.archivedAt,
      'archive did not set archivedAt — an archived row needs a non-null archivedAt so it surfaces under the Archived view with an "Archived on …" date.',
    ).not.toBeNull();
    expect(
      stored.deletedAt,
      'archive set deletedAt — archiving must only touch archivedAt, never deletedAt.',
    ).toBeNull();
    expect(
      stored.version,
      'archive did not bump version — every lifecycle write must increment version so the next precondition check is honest.',
    ).toBe(before + 1);
  });
});

describe('Requirement 2 — restoring returns an archived row to Active', () => {
  it('restore clears archivedAt, bumps version, and returns the row to the active set', async () => {
    const row = seededArchived();
    const before = row.version;

    const result = await restoreInvoice(null, lifecycleFormData(row));

    expect(
      result.ok,
      'restoreInvoice returned a failure for a seeded archived row — it should clear archivedAt and return ok(row). Check the restore() stub return.',
    ).toBe(true);

    const stored = findInvoice('org-acme', row.id) as Invoice;
    expect(
      stored.archivedAt,
      'restore left archivedAt set — restoring must clear archivedAt so the row reappears in Active.',
    ).toBeNull();
    expect(
      stored.version,
      'restore did not bump version — every lifecycle write must increment version.',
    ).toBe(before + 1);
  });
});

describe('Requirement 3 — an admin can soft-delete, and restore brings a deleted row back', () => {
  it('soft-delete sets deletedAt and bumps version', async () => {
    const row = anActiveRow();
    const before = row.version;

    const result = await softDeleteInvoice(null, lifecycleFormData(row));

    expect(
      result.ok,
      'softDeleteInvoice refused a clean active row for an admin — it should set deletedAt and return ok(row). Check the softDelete() stub return and the admin gate.',
    ).toBe(true);

    const stored = findInvoice('org-acme', row.id) as Invoice;
    expect(
      stored.deletedAt,
      'soft-delete did not set deletedAt — a soft-deleted row needs a non-null deletedAt so it drops from the default list and shows the Deleted badge under All.',
    ).not.toBeNull();
    expect(
      stored.version,
      'soft-delete did not bump version — every lifecycle write must increment version.',
    ).toBe(before + 1);
  });

  it('restore clears a soft-deleted row back to active (the restore path branches on state)', async () => {
    const row = seededDeleted();
    const before = row.version;

    actAs('org-acme:admin');
    const result = await restoreInvoice(null, lifecycleFormData(row));

    expect(
      result.ok,
      'restoreInvoice refused a soft-deleted row — restore must reuse one action that clears whichever lifecycle flag is set, not split into two.',
    ).toBe(true);

    const stored = findInvoice('org-acme', row.id) as Invoice;
    expect(
      stored.deletedAt,
      'restore left deletedAt set — restoring a deleted row must clear deletedAt.',
    ).toBeNull();
    expect(
      stored.archivedAt,
      'restore left archivedAt set on the undeleted row — restore clears both flags.',
    ).toBeNull();
    expect(
      stored.version,
      'restore did not bump version on the undelete path.',
    ).toBe(before + 1);
  });
});

describe('Requirement 4 — a member cannot soft-delete', () => {
  it('softDeleteInvoice refuses a member ctx and leaves the row untouched', async () => {
    const row = anActiveRow();

    actAs('org-acme:member');
    const result = await softDeleteInvoice(null, lifecycleFormData(row));

    expect(
      result.ok,
      'softDeleteInvoice succeeded for a member — soft-delete must be admin-gated AT THE ACTION (authedAction("admin", …)), not only in the UI. Hiding the menu item is cosmetic on top of this.',
    ).toBe(false);

    const stored = findInvoice('org-acme', row.id) as Invoice;
    expect(
      stored.deletedAt,
      'a member-triggered soft-delete still mutated the row — the role gate must refuse before any store write.',
    ).toBeNull();
  });

  it('still lets a member archive (archive/restore are open to member)', async () => {
    const row = anActiveRow();

    actAs('org-acme:member');
    const result = await archiveInvoice(null, lifecycleFormData(row));

    expect(
      result.ok,
      'archiveInvoice refused a member — archive must be open to member; only soft-delete is admin-gated.',
    ).toBe(true);
  });
});

describe('Requirement 5 — a stale precondition returns a conflict, not a silent clobber', () => {
  it('archive against a stale version returns a conflict and does not mutate the row', async () => {
    const row = anActiveRow();
    const stale = lifecycleFormData({ id: row.id, version: row.version - 1 });

    const result = await archiveInvoice(null, stale);

    expect(
      result.ok,
      'archiveInvoice applied a stale-version write — it must check id+version and refuse a mismatch instead of clobbering.',
    ).toBe(false);
    if (!result.ok) {
      expect(
        result.error.code,
        'a stale-version archive returned the wrong error code — a lost optimistic-concurrency race should surface as code "conflict".',
      ).toBe('conflict');
    }

    const stored = findInvoice('org-acme', row.id) as Invoice;
    expect(
      stored.archivedAt,
      'a refused (conflicting) archive still mutated the row — the precondition must be checked BEFORE the field mutation.',
    ).toBeNull();
  });

  it('archiving a row already in the target state is itself a conflict', async () => {
    const row = seededArchived();

    const result = await archiveInvoice(null, lifecycleFormData(row));

    expect(
      result.ok,
      'archiveInvoice archived an already-archived row — only an active row may be archived; an already-archived row is a conflict.',
    ).toBe(false);
  });
});

describe('Requirement 6 — the audit entry rides with the mutation atomically', () => {
  it('a successful archive writes exactly one audit row in the same step', async () => {
    const row = anActiveRow();
    const before = auditCountFor(row.id);

    const result = await archiveInvoice(null, lifecycleFormData(row));
    expect(result.ok, 'archive should succeed for a clean active row').toBe(
      true,
    );

    expect(
      auditCountFor(row.id),
      'a successful archive must push exactly one audit row — the audit write is atomic with the mutation, so the inspector counts and tail move together.',
    ).toBe(before + 1);
  });

  it('a refused (conflicting) action writes NO audit row', async () => {
    const row = anActiveRow();
    const before = auditCountFor(row.id);
    const stale = lifecycleFormData({ id: row.id, version: row.version - 1 });

    await archiveInvoice(null, stale);

    expect(
      auditCountFor(row.id),
      'a refused archive still wrote an audit row — the audit push must come after the precondition passes, never on the conflict branch.',
    ).toBe(before);
  });
});
