import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Environment shims ────────────────────────────────────────────────────────
// The job opens with `import 'server-only'`, which has no node build and throws
// on import. Stub it so the job loads in this node-env test exactly as it would
// inside an RSC bundle.
vi.mock('server-only', () => ({}));

// In the live runtime the Next compiler supplies a real cache scope and the
// `next/cache` primitives talk to it; under vitest there is none. We stand in
// recording spies so the job body runs to completion and we capture exactly
// which primitive fired, against which tag, with which profile argument.
// `updateTag` (read-your-writes) and `revalidateTag` (eventual) are distinct
// functions here so the test can prove the job took the eventual branch.
// `cacheLife`/`cacheTag` are present so the read layer can also import this
// mock without crashing.
type TagCall = {
  fn: 'updateTag' | 'revalidateTag';
  tag: string;
  profile?: string;
};
const tagCalls: TagCall[] = [];
vi.mock('next/cache', () => ({
  updateTag: (tag: string) => {
    tagCalls.push({ fn: 'updateTag', tag });
  },
  revalidateTag: (tag: string, profile?: string) => {
    tagCalls.push({ fn: 'revalidateTag', tag, profile });
  },
  revalidatePath: () => {},
  cacheLife: () => {},
  cacheTag: () => {},
}));

// ── Helpers (inlined; depend only on the student's public surface) ───────────
type Store = typeof import('@/server/store');
type Job = typeof import('@/server/jobs/summary-recompute');

// Tags are derived through the same helper the student's code uses, so the test
// asserts the observable shape without re-hand-writing any raw `org:` literal.
const tags = async () => (await import('@/lib/cache/tags')).invoiceTags;

// Independently derive the expected active totals for an org straight off the
// raw seeded rows — active = neither archived nor soft-deleted. This is the
// answer the recompute must reproduce; we never call the student's query path
// to compute it, so a bug there can't mask a bug here.
const expectedActive = (store: Store, orgId: string) => {
  const rows = store.invoices.filter(
    (inv) =>
      inv.orgId === orgId && inv.archivedAt === null && inv.deletedAt === null,
  );
  return {
    totalCount: rows.length,
    totalAmount: rows.reduce((sum, inv) => sum + Number(inv.total), 0),
  };
};

let store: Store;
let job: Job;

beforeEach(async () => {
  tagCalls.length = 0;
  store = await import('@/server/store');
  job = await import('@/server/jobs/summary-recompute');
  // Deterministic baseline for every test: fresh seed, empty summaries + log.
  store.reseed();
});

describe('Requirement 1 — the recompute returns the org’s active count and total', () => {
  it('returns the count and summed total over active rows, excluding archived and soft-deleted', async () => {
    const want = expectedActive(store, 'org-acme');
    // Sanity: the seed must actually contain a non-active row, or "excludes"
    // proves nothing.
    expect(
      store.invoices.some(
        (inv) =>
          inv.orgId === 'org-acme' &&
          (inv.archivedAt !== null || inv.deletedAt !== null),
      ),
      'Seed has no archived/deleted org-acme row, so the exclusion can’t be exercised.',
    ).toBe(true);

    const result = await job.recomputeOrgSummary({ orgId: 'org-acme' });

    expect(
      result.orgId,
      'The recompute returned a result for the wrong org — echo back the validated orgId.',
    ).toBe('org-acme');
    expect(
      result.totalCount,
      'The returned count does not match the org’s active invoices. The recompute must count only non-archived, non-deleted rows.',
    ).toBe(want.totalCount);
    expect(
      result.totalAmount,
      'The returned total does not match the sum over active invoices. Sum total only across non-archived, non-deleted rows.',
    ).toBe(want.totalAmount);
  });

  it('isolates the org — recomputing org-acme returns org-acme’s totals, not org-globex’s', async () => {
    const acme = expectedActive(store, 'org-acme');
    const globex = expectedActive(store, 'org-globex');
    // The two orgs have distinct active counts in the seed, so a leak is visible.
    expect(
      acme.totalCount,
      'Both seeded orgs have the same active count — tenant isolation can’t be observed.',
    ).not.toBe(globex.totalCount);

    const result = await job.recomputeOrgSummary({ orgId: 'org-globex' });

    expect(
      result.totalCount,
      'Recomputing org-globex returned a count that isn’t org-globex’s. The recompute must scope every row to the payload org.',
    ).toBe(globex.totalCount);
  });
});

describe('Requirement 2 — the recompute upserts the org’s one summary row', () => {
  it('creates the summary row with the recomputed totals when none exists', async () => {
    const want = expectedActive(store, 'org-acme');
    expect(
      store.getSummaryRow('org-acme'),
      'A fresh seed should have no summary row yet — reseed clears summaries.',
    ).toBeUndefined();

    await job.recomputeOrgSummary({ orgId: 'org-acme' });

    const row = store.getSummaryRow('org-acme');
    expect(
      row,
      'The recompute wrote no summary row. It must upsert the org’s aggregate row into the store.',
    ).toBeDefined();
    expect(
      row?.totalCount,
      'The persisted summary count differs from the recomputed totals — write the same numbers you computed.',
    ).toBe(want.totalCount);
    expect(
      row?.totalAmount,
      'The persisted summary total differs from the recomputed totals — write the same numbers you computed.',
    ).toBe(want.totalAmount);
    expect(
      typeof row?.updatedAt === 'string' &&
        !Number.isNaN(Date.parse(row.updatedAt)),
      'The summary row has no valid updatedAt timestamp — stamp a fresh ISO time on every recompute.',
    ).toBe(true);
  });

  it('replaces (does not duplicate) an existing summary row on a second run', async () => {
    // Pre-seed a stale row, then recompute and confirm the row was replaced in
    // place with fresh numbers — the summary table holds exactly one row per org.
    store.upsertSummaryRow({
      orgId: 'org-acme',
      totalCount: -1,
      totalAmount: -1,
      updatedAt: '2000-01-01T00:00:00.000Z',
    });
    const want = expectedActive(store, 'org-acme');

    await job.recomputeOrgSummary({ orgId: 'org-acme' });

    const row = store.getSummaryRow('org-acme');
    expect(
      row?.totalCount,
      'A second recompute did not overwrite the stale count. Upsert must replace the existing row, not leave the old totals.',
    ).toBe(want.totalCount);
    expect(
      row?.updatedAt,
      'The recompute kept the stale updatedAt. Each run must stamp a fresh timestamp.',
    ).not.toBe('2000-01-01T00:00:00.000Z');
  });
});

describe('Requirement 3 — a malformed payload is rejected at the job boundary', () => {
  it('rejects an empty orgId rather than recomputing the wrong (or no) org', async () => {
    await expect(
      job.recomputeOrgSummary({ orgId: '' }),
      'An empty orgId was accepted. Validate the payload at the boundary so a misconfigured caller surfaces a parse error, not a silent recompute.',
    ).rejects.toThrow();
  });

  it('rejects a missing orgId at the boundary', async () => {
    await expect(
      // Intentionally violates the input type — a misconfigured caller.
      job.recomputeOrgSummary({} as { orgId: string }),
      'A payload with no orgId was accepted. The boundary schema must require a non-empty orgId.',
    ).rejects.toThrow();
  });

  it('does not touch the store when the payload is rejected', async () => {
    const logLen = store.invalidationLog.length;
    await job.recomputeOrgSummary({ orgId: '' }).catch(() => {
      /* expected */
    });
    expect(
      store.invalidationLog.length,
      'A rejected payload still recorded an invalidation. Parse the payload first, before any recompute, write, or log.',
    ).toBe(logLen);
  });
});

describe('Requirement 4 — the recompute records one job-sourced summary invalidation', () => {
  it('fires the eventual primitive against the summary tag with the required profile', async () => {
    const t = await tags();
    await job.recomputeOrgSummary({ orgId: 'org-acme' });

    const summaryTag = t.summary('org-acme');
    const call = tagCalls.find((c) => c.tag === summaryTag);
    expect(
      call,
      'The recompute never invalidated the summary tag. After upserting the row it must invalidate the org summary so the next visit reads the new totals.',
    ).toBeDefined();
    expect(
      call?.fn,
      'The summary was invalidated with updateTag (read-your-writes). No user is waiting on a background recompute — use the eventual primitive, revalidateTag.',
    ).toBe('revalidateTag');
    expect(
      call?.profile,
      'revalidateTag was called without a cacheLife profile argument. Next.js 16 requires the profile as the second argument (the single-arg form is deprecated).',
    ).toBe('max');
  });

  it('records exactly one invalidation-log entry for the summary tag, sourced as job', async () => {
    const t = await tags();
    const from = store.invalidationLog.length;

    await job.recomputeOrgSummary({ orgId: 'org-acme' });

    const entries = store.invalidationLog.slice(from);
    expect(
      entries.length,
      'The recompute logged the wrong number of invalidations. A background recompute touches one tag — the org summary — so it records exactly one entry.',
    ).toBe(1);
    const [entry] = entries;
    expect(
      entry?.tag,
      'The logged invalidation isn’t the summary tag. Log the same tag you invalidated, drawn through the tags helper.',
    ).toBe(t.summary('org-acme'));
    expect(
      entry?.source,
      'The invalidation was logged as something other than "job". A background recompute is job-sourced — that is what distinguishes it from the action entries in the inspector tail.',
    ).toBe('job');
  });
});
