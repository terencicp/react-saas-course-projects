import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `queries.ts` / `store.ts` open with `import 'server-only'`, which has no node
// build and would throw on import. Stub it so the read layer loads in this
// node-env test exactly as it would inside an RSC bundle.
vi.mock('server-only', () => ({}));

// In the dev/prod runtime the Next compiler strips `'use cache'` and supplies a
// real cache scope for cacheLife()/cacheTag(); under vitest there is none, so
// cacheLife() throws "only available with the cacheComponents config". We stand
// in spies for both: the cached body runs, and we capture exactly which profile
// and which tags each read emits — the observable that proves the directive
// stack is wired without needing the live cache.
const cacheLifeCalls: string[] = [];
const cacheTagCalls: string[][] = [];
vi.mock('next/cache', () => ({
  cacheLife: (profile: string) => {
    cacheLifeCalls.push(profile);
  },
  cacheTag: (...tags: string[]) => {
    cacheTagCalls.push(tags);
  },
}));

beforeEach(() => {
  cacheLifeCalls.length = 0;
  cacheTagCalls.length = 0;
});

// Read a source file as text so a source-shape assertion (no session reads in a
// cached body) can run without exercising the cache runtime. The base must stay
// a URL — a bare path is not a valid `new URL()` base, and a file: URL handles
// the spaces and parens in this project path.
const readSource = (rel: string) =>
  readFileSync(new URL(rel, new URL('../', import.meta.url)), 'utf8');

const srcRoot = fileURLToPath(new URL('../src', import.meta.url));

// Walk every source file and collect each one whose text contains a raw `org:`
// tag-string template literal — the single-source-of-truth constraint says only
// tags.ts may. Comments referencing the convention count as text, so we read the
// path, not the AST; tags.ts is the only legitimate home either way.
const filesWithRawTagLiteral = (): string[] => {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = `${dir}/${entry}`;
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) {
        continue;
      }
      if (/`org:/.test(readFileSync(full, 'utf8'))) {
        hits.push(full);
      }
    }
  };
  walk(srcRoot);
  return hits;
};

const listDefaults = {
  view: 'active',
  status: null,
  sort: '-createdAt',
  q: '',
  cursor: null,
  role: 'admin',
} as const;

describe('Requirement 1 — tag strings live only in tags.ts and are pure functions of their args', () => {
  it('each helper returns its documented scoped string', async () => {
    const { invoiceTags } = await import('@/lib/cache/tags');
    expect(
      invoiceTags.list('org-acme'),
      'invoiceTags.list still returns the empty stub. It must build the scoped list tag of the shape org:<orgId>:invoices from its argument.',
    ).toBe('org:org-acme:invoices');
    expect(
      invoiceTags.record('org-acme', 'inv-0001'),
      'invoiceTags.record still returns the empty stub. It must build a tag of the shape org:<orgId>:invoice:<id> from its two arguments.',
    ).toBe('org:org-acme:invoice:inv-0001');
    expect(
      invoiceTags.summary('org-acme'),
      'invoiceTags.summary still returns the empty stub. It must build a tag of the shape org:<orgId>:summary from its argument.',
    ).toBe('org:org-acme:summary');
  });

  it('the tag is a pure function of its args — a different org yields a different scope', async () => {
    const { invoiceTags } = await import('@/lib/cache/tags');
    expect(
      invoiceTags.list('org-globex'),
      'The list tag must vary with orgId so two tenants never share a cache scope. It is not threading the orgId argument into the string.',
    ).toBe('org:org-globex:invoices');
    expect(
      invoiceTags.list('org-acme') === invoiceTags.list('org-globex'),
      'Two different orgs produced the same list tag — the helper is ignoring its orgId argument.',
    ).toBe(false);
  });

  it('no raw `org:` tag literal exists outside tags.ts', () => {
    const offenders = filesWithRawTagLiteral().filter(
      (f) => !f.endsWith('/lib/cache/tags.ts'),
    );
    expect(
      offenders,
      `A raw "org:" tag string was hand-written outside tags.ts (${offenders.join(', ')}). Every read and write site must import the invoiceTags helper so they share one source of truth.`,
    ).toEqual([]);
  });
});

describe('Requirement 2 — the paginated list is a cached read keyed by org', () => {
  it('listInvoices opens the minutes profile and tags the org list', async () => {
    const { listInvoices } = await import('@/lib/invoices/queries');
    const result = await listInvoices({ orgId: 'org-acme', ...listDefaults });
    expect(
      cacheLifeCalls,
      "listInvoices never called cacheLife. A cached read must declare its staleness ceiling — open the body with 'use cache' then cacheLife('minutes').",
    ).toContain('minutes');
    expect(
      cacheTagCalls.some((tags) => tags.includes('org:org-acme:invoices')),
      'listInvoices never tagged itself with the org list tag. Call cacheTag(invoiceTags.list(orgId)) so an org-level write can later reach this entry.',
    ).toBe(true);
    expect(
      typeof result.fetchedAt,
      'listInvoices must return a fetchedAt timestamp computed inside the cached body — it is the only window into hit/miss. The return is missing fetchedAt.',
    ).toBe('string');
    expect(
      result.rows.length > 0,
      'listInvoices returned no rows for the seeded active view; the existing query logic must keep running underneath the directives.',
    ).toBe(true);
  });

  it('the list tag follows the org argument, never ambient state', async () => {
    const { listInvoices } = await import('@/lib/invoices/queries');
    await listInvoices({ orgId: 'org-globex', ...listDefaults });
    expect(
      cacheTagCalls.some((tags) => tags.includes('org:org-globex:invoices')),
      'Reading org-globex still tagged a different org. The cached body must tag from the orgId argument passed in by the page, never from session.',
    ).toBe(true);
  });
});

describe('Requirement 3 — the per-org summary is cached and works against the empty seed', () => {
  it('getOrgInvoiceSummary opens the hours profile and tags the org summary', async () => {
    const { getOrgInvoiceSummary } = await import('@/lib/invoices/queries');
    const summary = await getOrgInvoiceSummary('org-acme');
    expect(
      cacheLifeCalls,
      "getOrgInvoiceSummary never called cacheLife. The summary tolerates longer staleness than the list — open with 'use cache' then cacheLife('hours').",
    ).toContain('hours');
    expect(
      cacheTagCalls.some((tags) => tags.includes('org:org-acme:summary')),
      'getOrgInvoiceSummary never tagged itself with the org summary tag. Call cacheTag(invoiceTags.summary(orgId)).',
    ).toBe(true);
    expect(
      typeof summary.fetchedAt,
      'getOrgInvoiceSummary must return a fetchedAt computed inside the cached body. The return is missing fetchedAt.',
    ).toBe('string');
  });

  it('falls back to a live aggregate when no summaries row exists yet', async () => {
    const { getOrgInvoiceSummary } = await import('@/lib/invoices/queries');
    const summary = await getOrgInvoiceSummary('org-acme');
    expect(
      summary.totalCount > 0 && summary.totalAmount > 0,
      'The seed leaves the summaries map empty, so the read must compute a live count + sum over the active rows. It returned a zero/empty aggregate instead of falling back.',
    ).toBe(true);
  });
});

describe('Requirement 4 — filter arguments participate in the cache key', () => {
  it('a different filter argument produces a distinct result for its own entry', async () => {
    const { listInvoices } = await import('@/lib/invoices/queries');
    const all = await listInvoices({ orgId: 'org-acme', ...listDefaults });
    const paid = await listInvoices({
      orgId: 'org-acme',
      ...listDefaults,
      status: 'paid',
    });
    expect(
      paid.rows.every((row) => row.status === 'paid'),
      'Filtering by ?status=paid returned non-paid rows, so the status argument is not flowing through the read. Each distinct argument set must mint its own cache entry.',
    ).toBe(true);
    expect(
      JSON.stringify(paid.rows.map((r) => r.id)) !==
        JSON.stringify(all.rows.map((r) => r.id)),
      'The paid filter returned the same page as the unfiltered list. The filter must change the result, which is what makes it a distinct cache key.',
    ).toBe(true);
  });

  it('the read is deterministic for a fixed argument set', async () => {
    const { listInvoices } = await import('@/lib/invoices/queries');
    const first = await listInvoices({ orgId: 'org-acme', ...listDefaults });
    const second = await listInvoices({ orgId: 'org-acme', ...listDefaults });
    expect(
      first.rows.map((r) => r.id),
      'Re-reading the identical argument set returned a different page — a cache entry keyed on those args would serve the same rows, so the read must be a pure function of its arguments.',
    ).toEqual(second.rows.map((r) => r.id));
  });
});

describe('Requirement 5 — the single-invoice detail is cached and carries the tag union', () => {
  it('getInvoiceDetail opens the minutes profile and tags both record and list', async () => {
    const { listInvoices, getInvoiceDetail } = await import(
      '@/lib/invoices/queries'
    );
    const list = await listInvoices({ orgId: 'org-acme', ...listDefaults });
    const id = list.rows[0]?.id;
    expect(
      id,
      'No seeded invoice to read a detail for; the list read must return rows first.',
    ).toBeTruthy();

    cacheLifeCalls.length = 0;
    cacheTagCalls.length = 0;
    const detail = await getInvoiceDetail({
      orgId: 'org-acme',
      id: id as string,
      role: 'admin',
    });
    expect(
      cacheLifeCalls,
      "getInvoiceDetail never called cacheLife. The detail is read and edited often — open with 'use cache' then cacheLife('minutes').",
    ).toContain('minutes');

    const emitted = cacheTagCalls.flat();
    expect(
      emitted.includes(`org:org-acme:invoice:${id}`),
      'getInvoiceDetail never tagged the record. Call cacheTag with invoiceTags.record(orgId, id) so a single-invoice write can invalidate this entry.',
    ).toBe(true);
    expect(
      emitted.includes('org:org-acme:invoices'),
      'getInvoiceDetail tags only the record. It must also carry invoiceTags.list(orgId) so an org-wide write reaches it — the tag union from chapter 072.',
    ).toBe(true);
    expect(
      typeof detail?.fetchedAt,
      'getInvoiceDetail must return a fetchedAt computed inside the cached body. The return is missing fetchedAt.',
    ).toBe('string');
  });
});

describe('Requirement 6 — the cached bodies read no ambient session state', () => {
  it('queries.ts contains no session, cookies, or headers reads', () => {
    const source = readSource('src/lib/invoices/queries.ts');
    const forbidden = ['getSession', 'cookies(', 'headers(', 'acting-identity'];
    const found = forbidden.filter((token) => source.includes(token));
    expect(
      found,
      `queries.ts reaches for request-scoped state (${found.join(', ')}). A cached body's tags and result must depend only on its arguments — the page passes orgId/role in, so the cache key never silently leaks session.`,
    ).toEqual([]);
  });

  it('the emitted tags are derived purely from the passed orgId', async () => {
    const { listInvoices } = await import('@/lib/invoices/queries');
    await listInvoices({ orgId: 'org-globex', ...listDefaults });
    const emitted = cacheTagCalls.flat();
    expect(
      emitted.length > 0 && emitted.every((tag) => tag.includes('org-globex')),
      'A cached read tagged itself with an org other than the one passed in. With no session available in this environment, every emitted tag must scope to the argument orgId.',
    ).toBe(true);
  });
});
