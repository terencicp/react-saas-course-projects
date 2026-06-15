import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Environment shims -------------------------------------------------------
//
// `updateInvoice` runs as a Server Action: `authedAction` resolves the session
// through `next/headers` cookies, and the action calls `revalidatePath` from
// `next/cache`. Neither resolves in a node-env test, so stub both with the
// minimum surface the action touches. `server-only` is a build marker with no
// node resolution — stub it to an empty module so the store / action modules
// load exactly as they would inside a server bundle.
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

// A mutable cookie value the test controls. `actAs(identity)` points the
// session at a seeded `<orgId>:<role>` identity before invoking the action,
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

import { ConflictBanner } from '@/app/(app)/invoices/[id]/edit/conflict-banner';
import { updateInvoice } from '@/lib/invoices/actions';
import { findInvoice, invoices, reseed } from '@/server/store';
import type { Invoice } from '@/server/types';

// Build the edit FormData the form would submit. FormData is always strings, so
// `version` rides as a string and the action's schema coerces it back.
const editFormData = (fields: {
  id: string;
  customerName: string;
  status: string;
  total: string;
  version: number;
  overwrite?: boolean;
}): FormData => {
  const fd = new FormData();
  fd.set('id', fields.id);
  fd.set('customerName', fields.customerName);
  fd.set('status', fields.status);
  fd.set('total', fields.total);
  fd.set('version', String(fields.version));
  if (fields.overwrite !== undefined) {
    fd.set('overwrite', String(fields.overwrite));
  }
  return fd;
};

// Pull seeded rows straight from the store so the tests assert against the real
// seed shape rather than hard-coded ids.
const anAcmeRow = (): Invoice =>
  invoices.find(
    (inv) =>
      inv.orgId === 'org-acme' &&
      inv.archivedAt === null &&
      inv.deletedAt === null,
  ) as Invoice;

const aGlobexRow = (): Invoice =>
  invoices.find((inv) => inv.orgId === 'org-globex') as Invoice;

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(el);

// Read a solution source file relative to the project root (one level up from
// lesson-verification/). Keep the base a URL — a bare path is not a valid
// `new URL()` base; a file: URL is, and it handles the space in the folder name.
const readSource = (rel: string): string =>
  readFileSync(new URL(rel, new URL('../', import.meta.url)), 'utf8');

beforeEach(() => {
  // The action mutates the store; reseed keeps the suite order-proof.
  reseed();
  actAs('org-acme:admin');
});

describe('Requirement 1 — a two-tab race: first submit wins, the second gets an honest conflict', () => {
  it('the first submit succeeds and bumps version', async () => {
    const row = anAcmeRow();
    const before = row.version;

    const result = await updateInvoice(
      null,
      editFormData({
        id: row.id,
        customerName: 'First Tab Co',
        status: row.status,
        total: row.total,
        version: before,
      }),
    );

    expect(
      result.ok,
      'updateInvoice rejected a clean save (version matched the row) — the precondition must let a matching version through to the mutation.',
    ).toBe(true);

    const stored = findInvoice('org-acme', row.id) as Invoice;
    expect(
      stored.customerName,
      'updateInvoice did not apply the edit on the winning save.',
    ).toBe('First Tab Co');
    expect(
      stored.version,
      'updateInvoice did not bump version on a successful edit — the next precondition check stays honest only if every write increments version.',
    ).toBe(before + 1);
  });

  it('the second submit (same starting version) returns a conflict and does NOT mutate the row', async () => {
    const row = anAcmeRow();
    const startVersion = row.version;

    // Tab A saves first — this bumps version to startVersion + 1.
    await updateInvoice(
      null,
      editFormData({
        id: row.id,
        customerName: 'Tab A',
        status: row.status,
        total: row.total,
        version: startVersion,
      }),
    );

    // Tab B still holds the stale starting version and submits its own edit.
    const second = await updateInvoice(
      null,
      editFormData({
        id: row.id,
        customerName: 'Tab B',
        status: row.status,
        total: row.total,
        version: startVersion,
      }),
    );

    expect(
      second.ok,
      'the second tab’s stale-version save succeeded — updateInvoice still applies edits unconditionally (the chapter-047 baseline). It must compare row.version to the submitted version and refuse a mismatch.',
    ).toBe(false);
    if (!second.ok) {
      expect(
        second.error.code,
        'a lost two-tab race returned the wrong error code — a stale-version write should surface as code "conflict".',
      ).toBe('conflict');
    }

    const stored = findInvoice('org-acme', row.id) as Invoice;
    expect(
      stored.customerName,
      'the losing tab still clobbered the row — the version precondition must be checked BEFORE the field mutation, never a silent last-write-wins.',
    ).toBe('Tab A');
  });

  it('the conflict result carries the server’s current row as `current` (one round trip, no refetch)', async () => {
    const row = anAcmeRow();
    const startVersion = row.version;

    await updateInvoice(
      null,
      editFormData({
        id: row.id,
        customerName: 'Winner',
        status: row.status,
        total: row.total,
        version: startVersion,
      }),
    );

    const loser = await updateInvoice(
      null,
      editFormData({
        id: row.id,
        customerName: 'Loser',
        status: row.status,
        total: row.total,
        version: startVersion,
      }),
    );

    expect(loser.ok).toBe(false);
    if (!loser.ok) {
      const current = loser.error.current as Invoice | undefined;
      expect(
        current,
        'the conflict did not carry `current` — return conflict(message, row) so the losing tab can recover in one round trip without a refetch.',
      ).toBeTruthy();
      expect(
        current?.customerName,
        'the conflict’s `current` is not the row the server holds now — the banner refreshes the form from this payload, so it must be the post-winner row.',
      ).toBe('Winner');
      expect(
        current?.version,
        'the conflict’s `current.version` is stale — "Use latest" reseeds the hidden version from it, so it must be the server’s current version.',
      ).toBe(startVersion + 1);
    }
  });

  it('the conflict banner renders the server’s current values from `current`', () => {
    const current: Invoice = {
      ...anAcmeRow(),
      customerName: 'Server Holds This',
      status: 'paid',
      currency: 'USD',
      total: '999.00',
    };

    const html = render(
      createElement(ConflictBanner, {
        current,
        onUseLatest: () => {},
        onOverwrite: () => {},
        canOverwrite: true,
      }),
    );

    expect(
      html,
      'the conflict banner did not render — conflict-banner.tsx still returns null. It must surface the server’s current row so the user can compare before recovering.',
    ).toContain('Server Holds This');
    expect(
      html,
      'the conflict banner did not render the current total — show currency + total so the losing tab sees what the server holds.',
    ).toContain('999.00');
  });
});

describe('Requirement 2 — "Use latest" reseeds the hidden version so the resubmit succeeds', () => {
  it('resubmitting with the conflict’s `current.version` (what "Use latest" loads) now succeeds', async () => {
    const row = anAcmeRow();
    const startVersion = row.version;

    await updateInvoice(
      null,
      editFormData({
        id: row.id,
        customerName: 'Winner',
        status: row.status,
        total: row.total,
        version: startVersion,
      }),
    );

    const loser = await updateInvoice(
      null,
      editFormData({
        id: row.id,
        customerName: 'Loser',
        status: row.status,
        total: row.total,
        version: startVersion,
      }),
    );
    expect(loser.ok).toBe(false);
    if (loser.ok) {
      return;
    }
    const current = loser.error.current as Invoice;

    // "Use latest" swaps the form's seed to `current`; the keyed remount resets
    // the hidden version to current.version. The resubmit carries that version.
    const retry = await updateInvoice(
      null,
      editFormData({
        id: row.id,
        customerName: 'Loser retried',
        status: current.status,
        total: current.total,
        version: current.version,
      }),
    );

    expect(
      retry.ok,
      'a resubmit carrying the conflict’s current.version was still refused — "Use latest" must reseed the hidden version from `current` so the next precondition matches.',
    ).toBe(true);
  });

  it('the edit form keys the hidden version on the seed so "Use latest" remounts it', () => {
    const source = readSource('src/app/(app)/invoices/[id]/edit/edit-form.tsx');
    expect(
      /key=\{`\$\{seed\.id\}:\$\{seed\.version\}`\}/.test(source),
      'the field block is not keyed on the seed id and version — without the keyed remount, swapping the seed on "Use latest" leaves the uncontrolled hidden version input showing the stale value and the resubmit re-conflicts.',
    ).toBe(true);
  });
});

describe('Requirement 3 — "Overwrite anyway" bypasses the version check for admins, but is re-gated server-side', () => {
  it('overwrite=true applies the edit despite a stale version (admin)', async () => {
    const row = anAcmeRow();
    const startVersion = row.version;

    // Someone else bumps the version out from under us.
    await updateInvoice(
      null,
      editFormData({
        id: row.id,
        customerName: 'Other tab',
        status: row.status,
        total: row.total,
        version: startVersion,
      }),
    );

    // We submit a stale version but with the admin-only override flag.
    const result = await updateInvoice(
      null,
      editFormData({
        id: row.id,
        customerName: 'Force mine',
        status: row.status,
        total: row.total,
        version: startVersion,
        overwrite: true,
      }),
    );

    expect(
      result.ok,
      'overwrite=true with a stale version was still refused for an admin — the escape hatch must skip the version precondition when overwrite is set.',
    ).toBe(true);

    const stored = findInvoice('org-acme', row.id) as Invoice;
    expect(
      stored.customerName,
      'overwrite=true did not apply the edit — bypassing the version check must still run the mutation.',
    ).toBe('Force mine');
  });

  it('a member forging overwrite=true is refused and the row is untouched', async () => {
    const row = anAcmeRow();
    const startVersion = row.version;
    const original = row.customerName;

    actAs('org-acme:member');
    const result = await updateInvoice(
      null,
      editFormData({
        id: row.id,
        customerName: 'Member forced this',
        status: row.status,
        total: row.total,
        version: startVersion,
        overwrite: true,
      }),
    );

    expect(
      result.ok,
      'a member’s forged overwrite=true succeeded — the admin gate must be re-checked AT THE ACTION (roleAtLeast(ctx.role, "admin")), not only behind the hidden UI button.',
    ).toBe(false);
    if (!result.ok) {
      expect(
        result.error.code,
        'a forged member overwrite returned the wrong code — refuse it as "forbidden".',
      ).toBe('forbidden');
    }

    const stored = findInvoice('org-acme', row.id) as Invoice;
    expect(
      stored.customerName,
      'a member’s forged overwrite still mutated the row — the role gate must refuse BEFORE any store write.',
    ).toBe(original);
  });
});

describe('Requirement 4 — a forged cross-tenant invoice ID is not found in the acting org', () => {
  it('an org-globex admin submitting an org-acme invoice ID hits not-found and never mutates the acme row', async () => {
    const acmeRow = anAcmeRow();
    const original = acmeRow.customerName;
    const startVersion = acmeRow.version;

    // The acting org is globex; the forged form carries an acme invoice id.
    actAs('org-globex:admin');
    const result = await updateInvoice(
      null,
      editFormData({
        id: acmeRow.id,
        customerName: 'Cross-tenant overwrite',
        status: acmeRow.status,
        total: acmeRow.total,
        version: startVersion,
      }),
    );

    expect(
      result.ok,
      'a cross-tenant write succeeded — the row must load via findInvoice(ctx.orgId, id), so another org’s id simply is not found.',
    ).toBe(false);
    if (!result.ok) {
      expect(
        result.error.code,
        'a forged cross-tenant id returned the wrong code — it should take the not-found path (org-scoped lookup misses), not a conflict.',
      ).toBe('not_found');
    }

    const stored = findInvoice('org-acme', acmeRow.id) as Invoice;
    expect(
      stored.customerName,
      'the org-acme row was mutated by an org-globex actor — tenant isolation must hold at the write, not just the read.',
    ).toBe(original);
  });

  it('the globex admin can still edit its own org’s row (the gate is tenancy, not a blanket refusal)', async () => {
    const glx = aGlobexRow();

    actAs('org-globex:admin');
    const result = await updateInvoice(
      null,
      editFormData({
        id: glx.id,
        customerName: 'Globex edit',
        status: glx.status,
        total: glx.total,
        version: glx.version,
      }),
    );

    expect(
      result.ok,
      'an org-globex admin could not edit its own row — the tenancy check must scope by acting org, not reject everything.',
    ).toBe(true);
  });
});
