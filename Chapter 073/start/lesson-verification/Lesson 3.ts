import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Environment shims ────────────────────────────────────────────────────────
// The action modules open with `import 'server-only'`, which has no node build
// and throws on import. Stub it so the write layer loads in this node-env test
// exactly as it would inside an RSC bundle.
vi.mock('server-only', () => ({}));

// In the live runtime the Next compiler supplies a real cache scope and the
// `next/cache` primitives talk to it; under vitest there is none. We stand in
// recording spies so the action body runs to completion and we capture exactly
// which primitive fired against which tag. `updateTag` (read-your-writes) and
// `revalidateTag` (eventual) are distinct functions here so the test can tell
// the misuse branch apart from the correct path. `cacheLife`/`cacheTag` are
// present so the read layer can also import this mock without crashing.
type TagCall = { fn: 'updateTag' | 'revalidateTag'; tag: string };
const tagCalls: TagCall[] = [];
const pathCalls: string[] = [];
vi.mock('next/cache', () => ({
  updateTag: (tag: string) => {
    tagCalls.push({ fn: 'updateTag', tag });
  },
  revalidateTag: (tag: string, _profile?: string) => {
    tagCalls.push({ fn: 'revalidateTag', tag });
  },
  revalidatePath: (path: string) => {
    pathCalls.push(path);
  },
  cacheLife: () => {},
  cacheTag: () => {},
}));

// The action resolves its session through `next/headers` cookies. There is no
// request here, so we drive the acting identity directly: set `actingIdentity`
// to an `<orgId>:<role>` string and the session resolves to that seeded user,
// letting us exercise org-A vs org-B and admin vs member from the test.
let actingIdentity: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'acting-identity' && actingIdentity
        ? { value: actingIdentity }
        : undefined,
  }),
}));

// ── Helpers (inlined; depend only on the student's public surface) ───────────
type Store = typeof import('@/server/store');
type Actions = typeof import('@/lib/invoices/actions');

// Tags are derived through the same helper the student's code uses, so the test
// asserts the observable shape without re-hand-writing any raw `org:` literal.
const tags = async () => (await import('@/lib/cache/tags')).invoiceTags;

const form = (fields: Record<string, string>): FormData => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    fd.set(k, v);
  }
  return fd;
};

// Tags that fired through any primitive this turn.
const firedTags = () => tagCalls.map((c) => c.tag);
// The primitive that handled a given tag this turn (undefined = never fired).
const primitiveFor = (tag: string) => tagCalls.find((c) => c.tag === tag)?.fn;
// Invalidation-log entries recorded since a marked length.
const loggedSince = (log: Store['invalidationLog'], from: number) =>
  log.slice(from);

let store: Store;
let actions: Actions;

beforeEach(async () => {
  tagCalls.length = 0;
  pathCalls.length = 0;
  actingIdentity = 'org-acme:admin';
  store = await import('@/server/store');
  actions = await import('@/lib/invoices/actions');
  // Deterministic baseline for every test: fresh seed, empty log, misuse off.
  store.reseed();
});

describe('Requirement 1 — editing an invoice refreshes the org list on the same render', () => {
  it('the edit commits the new value and fires the org list invalidation', async () => {
    const t = await tags();
    const row = store.findInvoice('org-acme', 'inv-0001');
    expect(row, 'Seed is missing inv-0001 for org-acme.').toBeDefined();
    if (!row) {
      return;
    }

    const result = await actions.updateInvoice(
      null,
      form({
        id: 'inv-0001',
        customerName: row.customerName,
        status: row.status,
        total: '999.00',
        version: String(row.version),
      }),
    );

    expect(
      result.ok,
      `The edit did not commit (${result.ok ? '' : result.error.userMessage}). The version precondition must pass and the action return ok before it can invalidate anything.`,
    ).toBe(true);
    expect(
      store.findInvoice('org-acme', 'inv-0001')?.total,
      'The new total is not in the store after a successful edit — the commit must land before the invalidation fan-out.',
    ).toBe('999.00');
    expect(
      firedTags(),
      'Editing an invoice never invalidated the org list tag. The user lands back on the list expecting their own write — fan updateTag out to the list tag after commit.',
    ).toContain(t.list('org-acme'));
  });
});

describe('Requirement 2 — the same edit refreshes the org summary totals', () => {
  it('the edit fires the org summary invalidation alongside the list', async () => {
    const t = await tags();
    const row = store.findInvoice('org-acme', 'inv-0001');
    if (!row) {
      throw new Error('Seed is missing inv-0001 for org-acme.');
    }

    await actions.updateInvoice(
      null,
      form({
        id: 'inv-0001',
        customerName: row.customerName,
        status: row.status,
        total: '777.00',
        version: String(row.version),
      }),
    );

    expect(
      firedTags(),
      'An edit changes the org totals but never invalidated the summary tag. The summary is one of the three cached entries a single mutation touches — invalidate it too.',
    ).toContain(t.summary('org-acme'));
  });
});

describe('Requirement 3 — the record tag scopes to the edited invoice only', () => {
  it('editing invoice A invalidates A’s record tag and never invoice B’s', async () => {
    const t = await tags();
    const a = store.findInvoice('org-acme', 'inv-0001');
    if (!a) {
      throw new Error('Seed is missing inv-0001 for org-acme.');
    }

    await actions.updateInvoice(
      null,
      form({
        id: 'inv-0001',
        customerName: a.customerName,
        status: a.status,
        total: '123.00',
        version: String(a.version),
      }),
    );

    expect(
      firedTags(),
      'Editing invoice A never invalidated its own record tag, so A’s detail view would stay stale. Include the record tag in the fan-out.',
    ).toContain(t.record('org-acme', 'inv-0001'));
    expect(
      firedTags(),
      'Editing invoice A also invalidated invoice B’s record tag. The record tag must scope to the affected invoice id, never a sibling.',
    ).not.toContain(t.record('org-acme', 'inv-0002'));
  });
});

describe('Requirement 4 — archive, restore, and soft-delete each refresh list + summary and move the row', () => {
  it('archive removes the row from the active set and fires list + summary', async () => {
    const t = await tags();
    const row = store.findInvoice('org-acme', 'inv-0001');
    if (!row) {
      throw new Error('Seed is missing inv-0001 for org-acme.');
    }

    const result = await actions.archiveInvoice(
      null,
      form({ id: 'inv-0001', version: String(row.version) }),
    );

    expect(
      result.ok,
      `Archive did not commit (${result.ok ? '' : result.error.userMessage}).`,
    ).toBe(true);
    expect(
      store.findInvoice('org-acme', 'inv-0001')?.archivedAt,
      'Archiving did not move the row out of the active set — archivedAt must be set on commit.',
    ).not.toBeNull();
    expect(
      firedTags(),
      'Archive fired no list invalidation. Every lifecycle change moves a row in/out of the list, so it must invalidate the list tag — share one fan-out helper across the three lifecycle actions.',
    ).toContain(t.list('org-acme'));
    expect(
      firedTags(),
      'Archive fired no summary invalidation. A lifecycle change shifts the org totals — invalidate the summary tag too.',
    ).toContain(t.summary('org-acme'));
  });

  it('restore returns the row to the active set and fires list + summary', async () => {
    const t = await tags();
    const archived = store.findInvoice('org-acme', 'inv-archived-1');
    expect(
      archived?.archivedAt,
      'Seed is missing the pre-archived row inv-archived-1.',
    ).not.toBeNull();
    if (!archived) {
      return;
    }

    const result = await actions.restoreInvoice(
      null,
      form({ id: 'inv-archived-1', version: String(archived.version) }),
    );

    expect(
      result.ok,
      `Restore did not commit (${result.ok ? '' : result.error.userMessage}).`,
    ).toBe(true);
    expect(
      store.findInvoice('org-acme', 'inv-archived-1')?.archivedAt,
      'Restoring did not return the row to the active set — archivedAt must be cleared on commit.',
    ).toBeNull();
    expect(
      firedTags(),
      'Restore fired no list invalidation. Use the same fan-out helper as archive.',
    ).toContain(t.list('org-acme'));
    expect(
      firedTags(),
      'Restore fired no summary invalidation. Use the same fan-out helper as archive.',
    ).toContain(t.summary('org-acme'));
  });

  it('soft-delete (admin) removes the row from the active set and fires list + summary', async () => {
    const t = await tags();
    const row = store.findInvoice('org-acme', 'inv-0001');
    if (!row) {
      throw new Error('Seed is missing inv-0001 for org-acme.');
    }

    const result = await actions.softDeleteInvoice(
      null,
      form({ id: 'inv-0001', version: String(row.version) }),
    );

    expect(
      result.ok,
      `Soft-delete did not commit (${result.ok ? '' : result.error.userMessage}). It is admin-gated; the seeded org-acme:admin identity should pass.`,
    ).toBe(true);
    expect(
      store.findInvoice('org-acme', 'inv-0001')?.deletedAt,
      'Soft-delete did not mark the row deleted — deletedAt must be set on commit.',
    ).not.toBeNull();
    expect(
      firedTags(),
      'Soft-delete fired no list invalidation. Use the same fan-out helper as archive.',
    ).toContain(t.list('org-acme'));
    expect(
      firedTags(),
      'Soft-delete fired no summary invalidation. Use the same fan-out helper as archive.',
    ).toContain(t.summary('org-acme'));
  });
});

describe('Requirement 5 — org-scoped tags isolate one tenant from another', () => {
  it('an edit in org A never invalidates org B’s list', async () => {
    const t = await tags();
    const row = store.findInvoice('org-acme', 'inv-0001');
    if (!row) {
      throw new Error('Seed is missing inv-0001 for org-acme.');
    }

    await actions.updateInvoice(
      null,
      form({
        id: 'inv-0001',
        customerName: row.customerName,
        status: row.status,
        total: '321.00',
        version: String(row.version),
      }),
    );

    expect(
      firedTags(),
      'Editing in org A never fired org A’s own list tag, so there is nothing isolating org B. Invalidate the acting org’s list on every edit first.',
    ).toContain(t.list('org-acme'));
    expect(
      firedTags(),
      'Editing in org A invalidated org B’s list tag. Every invalidation must scope to the acting org so one tenant’s write never busts another’s cache.',
    ).not.toContain(t.list('org-globex'));
    expect(
      firedTags().every((tag) => !tag.includes('org-globex')),
      'An org-A edit fired a tag scoped to org-globex. The fan-out must derive every tag from the acting org id.',
    ).toBe(true);
  });
});

describe('Requirement 6 — the misuse toggle swaps only the list primitive', () => {
  it('with the toggle off, the list tag goes through the read-your-writes primitive', async () => {
    const t = await tags();
    store.misuseFlag.misuseRevalidateFromAction = false;
    const row = store.findInvoice('org-acme', 'inv-0001');
    if (!row) {
      throw new Error('Seed is missing inv-0001 for org-acme.');
    }

    await actions.updateInvoice(
      null,
      form({
        id: 'inv-0001',
        customerName: row.customerName,
        status: row.status,
        total: '111.00',
        version: String(row.version),
      }),
    );

    expect(
      primitiveFor(t.list('org-acme')),
      'With the misuse toggle off, the list tag must be invalidated with updateTag (read-your-writes) so the submitting render reads its own write.',
    ).toBe('updateTag');
  });

  it('with the toggle on, only the list tag swaps to the eventual primitive; record + summary stay read-your-writes', async () => {
    const t = await tags();
    store.misuseFlag.misuseRevalidateFromAction = true;
    const row = store.findInvoice('org-acme', 'inv-0001');
    if (!row) {
      throw new Error('Seed is missing inv-0001 for org-acme.');
    }

    const result = await actions.updateInvoice(
      null,
      form({
        id: 'inv-0001',
        customerName: row.customerName,
        status: row.status,
        total: '222.00',
        version: String(row.version),
      }),
    );

    expect(
      result.ok,
      `The edit failed with the misuse toggle on (${result.ok ? '' : result.error.userMessage}). The flag must reroute only the list primitive, not break the action.`,
    ).toBe(true);
    expect(
      primitiveFor(t.list('org-acme')),
      'With the misuse toggle on, the list tag must route through revalidateTag (the eventual primitive) — the deliberate failure-mode branch the lesson stands up.',
    ).toBe('revalidateTag');
    expect(
      primitiveFor(t.record('org-acme', 'inv-0001')),
      'The misuse branch leaked onto the record tag. Only the list tag swaps; the record stays on updateTag.',
    ).toBe('updateTag');
    expect(
      primitiveFor(t.summary('org-acme')),
      'The misuse branch leaked onto the summary tag. Only the list tag swaps; the summary stays on updateTag.',
    ).toBe('updateTag');
  });
});

describe('Cross-cutting — invalidations are recorded as action-sourced log entries', () => {
  it('an edit records its invalidations through the log helper, sourced as action', async () => {
    const from = store.invalidationLog.length;
    const row = store.findInvoice('org-acme', 'inv-0001');
    if (!row) {
      throw new Error('Seed is missing inv-0001 for org-acme.');
    }

    await actions.updateInvoice(
      null,
      form({
        id: 'inv-0001',
        customerName: row.customerName,
        status: row.status,
        total: '444.00',
        version: String(row.version),
      }),
    );

    const entries = loggedSince(store.invalidationLog, from);
    expect(
      entries.length > 0,
      'The edit recorded no invalidation-log entries. Each real invalidation must be logged through the provided helper so the inspector tail reflects the write.',
    ).toBe(true);
    expect(
      entries.every((e) => e.source === 'action'),
      'An invalidation was logged with a source other than "action". A user-facing write fans out in-band, so every entry it records is action-sourced.',
    ).toBe(true);
  });
});
