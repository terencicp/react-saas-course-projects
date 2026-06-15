import { readFileSync } from 'node:fs';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { createElement, type FunctionComponent, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The testing adapter's props type marks `children` as required, which clashes
// with createElement's positional-children overload; widen it to a plain
// component that takes children as a child so the call type-checks cleanly.
const Adapter = NuqsTestingAdapter as unknown as FunctionComponent<{
  searchParams?: string;
}>;

// `queries.ts` / `store.ts` start with `import 'server-only'`, which has no node
// build and would throw on import. Stub it so the read layer loads in this
// node-env test exactly as it would inside an RSC bundle.
vi.mock('server-only', () => ({}));

afterEach(() => {
  vi.resetModules();
});

// Read a source file as text so we can assert the shape of client-side setters
// (cursor bundling, URL writes) that a node test can't exercise by clicking.
// The base must stay a URL — a bare path is not a valid `new URL()` base and a
// file: URL handles the spaces and parens in this project path.
const readSource = (rel: string) =>
  readFileSync(new URL(rel, new URL('../', import.meta.url)), 'utf8');

const toolbarSource = readSource('src/app/(app)/invoices/toolbar.tsx');
const viewTabsSource = readSource('src/app/(app)/invoices/view-tabs.tsx');
const paginationSource = readSource('src/app/(app)/invoices/pagination.tsx');
const clearChipSource = (() => {
  try {
    return readSource('src/app/(app)/invoices/clear-chip.tsx');
  } catch {
    // The student creates this file in this lesson; absence is a real failure.
    return '';
  }
})();

// Collapse whitespace so `cursor: null` matches regardless of formatting.
const flat = (s: string) => s.replace(/\s+/g, ' ');

// Real solution shape: page 1 of the default active view is 20 rows starting at
// inv-0001 with nextCursor inv-0020; page 2 starts at inv-0021 with hasPrev.
const defaultParsed = {
  status: null,
  sort: '-createdAt',
  view: 'active',
  q: '',
  cursor: null,
} as const;

describe('Requirement 1 — controls write the URL; defaults stay out of it', () => {
  it('reflects an active status / sort / view from the query string', async () => {
    const { invoiceListSearchParamsCache } = await import(
      '@/lib/invoices/search-params'
    );
    const parsed = await invoiceListSearchParamsCache.parse({
      status: 'paid',
      sort: '-total',
      view: 'archived',
    });
    expect(
      { status: parsed.status, sort: parsed.sort, view: parsed.view },
      'The search-params cache ignores the URL — it should read status/sort/view back off the query string instead of returning a hard-coded default. Define the five nuqs parsers in search-params.ts.',
    ).toEqual({ status: 'paid', sort: '-total', view: 'archived' });
  });

  it('parses a bare URL to the home state (defaults, no cursor)', async () => {
    const { invoiceListSearchParamsCache } = await import(
      '@/lib/invoices/search-params'
    );
    const parsed = await invoiceListSearchParamsCache.parse({});
    expect(
      parsed,
      'Bare /invoices must be the home state: status/cursor null, sort -createdAt, q empty, view active. Check the .withDefault(...) and nullable parsers.',
    ).toEqual(defaultParsed);
  });

  it('falls back to defaults for values outside the allowed set (so junk strips from the URL)', async () => {
    const { invoiceListSearchParamsCache } = await import(
      '@/lib/invoices/search-params'
    );
    const parsed = await invoiceListSearchParamsCache.parse({
      status: 'not-a-status',
      sort: 'not-a-sort',
      view: 'not-a-view',
    });
    expect(
      { status: parsed.status, sort: parsed.sort, view: parsed.view },
      'A value outside the enum must collapse to the default — that is what keeps defaults implicit and the URL clean. Use parseAsStringEnum with the exact allowed values.',
    ).toEqual({ status: null, sort: '-createdAt', view: 'active' });
  });

  it('the toolbar writes status/sort to the URL rather than holding them in local state', () => {
    expect(
      toolbarSource.includes('useQueryStates'),
      'The toolbar still drives status/sort from useState, so a refresh wipes the view. Lift the controls into the URL with useQueryStates(invoiceListSearchParams, ...).',
    ).toBe(true);
  });

  it('the view tabs write the view param on click', () => {
    expect(
      /useQueryState/.test(viewTabsSource) && /onClick/.test(viewTabsSource),
      'The view tabs render but have no onClick that writes the URL. Wire each tab to set { view, cursor: null } via a nuqs setter.',
    ).toBe(true);
  });
});

describe('Requirement 2 — the URL alone reproduces the identical view', () => {
  it('the same query string always parses to the same view-state', async () => {
    const { invoiceListSearchParamsCache } = await import(
      '@/lib/invoices/search-params'
    );
    const query = {
      status: 'sent',
      sort: '-total',
      view: 'all',
      q: 'acme',
      cursor: 'inv-0020',
    };
    const first = await invoiceListSearchParamsCache.parse({ ...query });
    const second = await invoiceListSearchParamsCache.parse({ ...query });
    expect(
      first,
      'Parsing must be a pure function of the URL — a pasted link should yield exactly the view-state of the tab it came from. The cache should not carry hidden state.',
    ).toEqual(second);
    expect(
      first,
      'Every param the URL carries (status, sort, view, q, cursor) must survive the round-trip so a hard reload preserves the full view.',
    ).toEqual({
      status: 'sent',
      sort: '-total',
      view: 'all',
      q: 'acme',
      cursor: 'inv-0020',
    });
  });

  it('feeding the parsed view-state to the read layer reproduces the same rows every time', async () => {
    const { invoiceListSearchParamsCache } = await import(
      '@/lib/invoices/search-params'
    );
    const { listInvoices } = await import('@/lib/invoices/queries');
    const parsed = await invoiceListSearchParamsCache.parse({});
    const read = () =>
      listInvoices({ orgId: 'org-acme', role: 'admin', ...parsed });
    const a = read().rows.map((r) => r.id);
    const b = read().rows.map((r) => r.id);
    expect(
      a,
      'The list keyed off the URL must be deterministic — re-reading the same view-state should return the identical page, or a shared link would render differently per visit.',
    ).toEqual(b);
    expect(
      a.length > 0,
      'The default view should return its first page of rows; an empty page means the parsed view-state is not reaching the read layer.',
    ).toBe(true);
  });
});

describe('Requirement 3 — active-filter chips render per non-default filter', () => {
  const renderChips = async (parsed: Record<string, unknown>) => {
    const { ActiveFilterChips } = await import(
      '@/app/(app)/invoices/active-filter-chips'
    );
    // The chips are a Server Component; call it as a function and let the
    // client ClearChip island render its markup under the test adapter.
    const tree = (ActiveFilterChips as (p: { parsed: unknown }) => ReactNode)({
      parsed,
    });
    return renderToStaticMarkup(
      createElement(Adapter, { searchParams: '' }, tree),
    );
  };

  it('renders a chip for each active status, search, and non-default sort', async () => {
    const html = await renderChips({
      status: 'paid',
      sort: '-total',
      view: 'active',
      q: 'acme',
      cursor: null,
    });
    expect(
      html.includes('paid'),
      'No status chip appeared for an active status filter. The chips component should emit one chip per non-default filter; right now it renders nothing.',
    ).toBe(true);
    expect(
      html.includes('acme'),
      'No search chip appeared for an active query. Render a chip when q is non-empty.',
    ).toBe(true);
    expect(
      /Sort/i.test(html),
      'No sort chip appeared for a non-default sort. Render a chip when sort differs from -createdAt.',
    ).toBe(true);
  });

  it('renders no chips when every filter is at its default', async () => {
    const html = await renderChips(defaultParsed);
    expect(
      /chip-status|chip-q|chip-sort/.test(html),
      'A chip rendered for a default filter. Only differences from the home state should appear, so a chip must not show for null status, empty q, or the default sort.',
    ).toBe(false);
  });

  it('gives each chip a clear control', async () => {
    const html = await renderChips({
      status: 'paid',
      sort: '-total',
      view: 'active',
      q: 'acme',
      cursor: null,
    });
    expect(
      (html.match(/<button/g) ?? []).length >= 3,
      'Each chip needs its own clear control. Embed a ClearChip button inside every chip so the filter can be removed from the URL.',
    ).toBe(true);
  });

  it("a chip's clear control strips its param and the cursor together", () => {
    expect(
      clearChipSource.length > 0,
      'clear-chip.tsx is missing. Create the ClearChip client component that clears a single filter param.',
    ).toBe(true);
    expect(
      /cursor:\s*null/.test(clearChipSource),
      'Clearing a filter must also drop the cursor (cursor: null) so the list returns to page one of the narrower result set — otherwise the kept cursor points past the end.',
    ).toBe(true);
  });
});

describe('Requirement 4 — cursor advances the page and resets when the result set changes', () => {
  it('carries a fresh cursor that advances the list to the next page', async () => {
    const { listInvoices } = await import('@/lib/invoices/queries');
    const page1 = listInvoices({
      orgId: 'org-acme',
      role: 'admin',
      ...defaultParsed,
    });
    expect(
      page1.nextCursor,
      'Page one of the seeded active view should expose a nextCursor so Next has something to carry into the URL.',
    ).not.toBeNull();

    const page2 = listInvoices({
      orgId: 'org-acme',
      role: 'admin',
      ...defaultParsed,
      cursor: page1.nextCursor,
    });
    const overlap = page2.rows.filter((r) =>
      page1.rows.some((p) => p.id === r.id),
    );
    expect(
      overlap.length,
      'Carrying nextCursor in the URL must advance to a distinct next page — page two is overlapping page one, so the cursor is not being applied to the read.',
    ).toBe(0);
    expect(
      page2.hasPrev,
      'A page reached via a cursor should report hasPrev so the First-page control can light up.',
    ).toBe(true);
  });

  it('drops the cursor back to page one when the cursor param is absent', async () => {
    const { listInvoices } = await import('@/lib/invoices/queries');
    const page1 = listInvoices({
      orgId: 'org-acme',
      role: 'admin',
      ...defaultParsed,
    });
    const reset = listInvoices({
      orgId: 'org-acme',
      role: 'admin',
      ...defaultParsed,
      cursor: null,
    });
    expect(
      reset.rows.map((r) => r.id),
      'A null cursor must land on page one — this is the page the list returns to whenever a filter/sort/search/view change strips the cursor.',
    ).toEqual(page1.rows.map((r) => r.id));
  });

  it('every reordering or shrinking setter bundles cursor: null in the same call', () => {
    const requireCursorReset = (source: string, where: string) =>
      expect(
        /cursor:\s*null/.test(flat(source)),
        `${where} changes the result set without bundling cursor: null in the same setter call. A kept cursor points past the end of a different result set — page one is the only safe landing, so every such setter must include cursor: null.`,
      ).toBe(true);

    requireCursorReset(toolbarSource, 'The toolbar (status/sort/search)');
    requireCursorReset(viewTabsSource, 'The view tabs');
    requireCursorReset(clearChipSource, 'The chip clear control');
  });

  it('the Next / First-page controls drive the cursor through the URL', () => {
    expect(
      /useQueryState/.test(paginationSource),
      'Pagination still renders inert, disabled buttons. Read and write the cursor with useQueryState so Next advances and First page resets it.',
    ).toBe(true);
    expect(
      /setCursor\(\s*null\s*\)/.test(flat(paginationSource)) ||
        /cursor:\s*null/.test(flat(paginationSource)),
      'First page must reset the cursor to null to return to the top of the list.',
    ).toBe(true);
  });
});
