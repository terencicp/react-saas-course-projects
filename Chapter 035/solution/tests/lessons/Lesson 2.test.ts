import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// The list slot embeds <StatusFilter>, a 'use client' component that calls
// useRouter()/useSearchParams(). Those hooks throw outside Next's app-router
// runtime, which a node-env unit test does not provide. We stub the framework
// boundary (never the student's code) so the real slot pages render to markup
// and we can assert the server-rendered list they produce.
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    useRouter: () => ({ replace() {}, push() {}, back() {}, refresh() {} }),
    useSearchParams: () => new URLSearchParams(),
  };
});

// Async Server Components are plain async functions: call with the props Next
// would pass (a `searchParams`/`params` Promise) and render the returned tree.
const renderSlot = async <P>(
  importPromise: Promise<{ default: (props: P) => unknown }>,
  props: P,
) => {
  const { default: Slot } = await importPromise;
  const element = (await Slot(props)) as React.ReactElement;
  return renderToStaticMarkup(element);
};

// The list renders one <li> per invoice, each a <Link href="/invoices/inv_XXX">
// carrying a status <Badge>. The filter pills also use a badge-like outline
// variant, so we anchor on the row href to count list rows only, never pills.
const rowIds = (html: string) =>
  [...html.matchAll(/href="\/invoices\/(inv_\d+)"/g)].map((m) => m[1]);

const rowStatuses = (html: string) =>
  [
    ...html.matchAll(
      /href="\/invoices\/inv_\d+"[\s\S]*?data-slot="badge"[^>]*>([a-z]+)<\/span>/g,
    ),
  ].map((m) => m[1]);

const TOTAL_INVOICES = 30; // full fixture (inv_001–inv_030)
const PAID_COUNT = 8; // invoices with status "paid"

// Requirement 1 — /invoices renders the filtered list and a "pick an invoice"
// empty state.
describe('/invoices renders the list beside the empty state', () => {
  it('the list slot renders an invoice row for every invoice plus the New invoice link', async () => {
    const html = await renderSlot(import('@/app/invoices/@list/page'), {
      searchParams: Promise.resolve({}),
    } as never);

    expect(
      rowIds(html).length,
      'The @list page should fetch invoices via listInvoices and render one row per invoice — it is still showing the placeholder or no rows.',
    ).toBe(TOTAL_INVOICES);

    expect(
      html,
      'The list header should include the "New invoice" link (data-testid="new-invoice-link") to /invoices/new.',
    ).toContain('data-testid="new-invoice-link"');
  });

  it('the detail slot default renders the empty "pick an invoice" prompt, not a detail and not a 404', async () => {
    const { default: DetailDefault } = await import(
      '@/app/invoices/@detail/default'
    );
    const html = renderToStaticMarkup(DetailDefault() as React.ReactElement);

    expect(
      html,
      '@detail/default.tsx is the "no invoice selected" empty state — it must render an element marked data-testid="detail-empty".',
    ).toContain('data-testid="detail-empty"');
    expect(
      html.toLowerCase(),
      'The empty state should prompt the user to pick an invoice.',
    ).toContain('pick an invoice');
  });
});

// Requirement 2 — /invoices/inv_001 renders the list alongside that invoice's
// detail. (The list half is covered by req 1/5; here we prove the detail half.)
describe('/invoices/inv_001 renders the selected invoice detail', () => {
  it('the detail slot renders the matching invoice for a known id', async () => {
    const html = await renderSlot(import('@/app/invoices/@detail/[id]/page'), {
      params: Promise.resolve({ id: 'inv_001' }),
    } as never);

    expect(
      html,
      '@detail/[id]/page.tsx should fetch the invoice with getInvoice(id) and render <InvoiceDetail> (data-testid="invoice-detail").',
    ).toContain('data-testid="invoice-detail"');
    expect(
      html,
      "The rendered detail should show inv_001's number (INV-2026-001), proving the id from the URL drove the fetch.",
    ).toContain('INV-2026-001');
  });
});

// Requirement 3 — ?status=paid filters the list server-side and the result is
// stable across a hard reload (because nothing lives in client state).
describe('?status=paid filters the list server-side', () => {
  it('only paid invoices appear when status=paid', async () => {
    const html = await renderSlot(import('@/app/invoices/@list/page'), {
      searchParams: Promise.resolve({ status: 'paid' }),
    } as never);

    const statuses = rowStatuses(html);
    expect(
      statuses.length,
      'status=paid should narrow the list — the page is still rendering all invoices (or the placeholder), so the filter is not applied server-side.',
    ).toBe(PAID_COUNT);
    expect(
      statuses.every((status) => status === 'paid'),
      `Every rendered row should have status "paid"; got: ${JSON.stringify(statuses)}.`,
    ).toBe(true);
  });

  it('rendering the same URL twice yields the same list (the filter is in the URL, not client state, so it survives a reload)', async () => {
    const first = await renderSlot(import('@/app/invoices/@list/page'), {
      searchParams: Promise.resolve({ status: 'paid' }),
    } as never);
    const second = await renderSlot(import('@/app/invoices/@list/page'), {
      searchParams: Promise.resolve({ status: 'paid' }),
    } as never);

    expect(
      rowIds(second).length,
      'The filtered list should be non-empty; if it is empty the page never applied the status filter to a real list.',
    ).toBe(PAID_COUNT);
    expect(
      rowIds(second),
      'A second server render of /invoices?status=paid must reproduce the same filtered list — the active filter is derived from searchParams, so a hard reload cannot lose it.',
    ).toEqual(rowIds(first));
  });
});

// Requirement 4 — ?status=banana (invalid) degrades to the full list, no crash.
describe('?status=banana falls back to the full list', () => {
  it('an invalid status renders all invoices instead of throwing', async () => {
    let html: string;
    try {
      html = await renderSlot(import('@/app/invoices/@list/page'), {
        searchParams: Promise.resolve({ status: 'banana' }),
      } as never);
    } catch (error) {
      throw new Error(
        `An invalid ?status must degrade to the full list, not crash. Validate searchParams with searchParamsSchema.safeParse and fall back to undefined. Got: ${String(error)}`,
      );
    }

    expect(
      rowIds(html).length,
      'An unrecognised status should be ignored, leaving the unfiltered list of all invoices.',
    ).toBe(TOTAL_INVOICES);
  });
});

// Requirement 5 — a direct visit to /invoices/inv_001 still paints the list,
// because @list carries a default.tsx that renders the full list when no list
// segment matched. This is the decision the lesson exists to teach.
describe('a direct detail visit still paints the list (@list/default.tsx)', () => {
  it('the @list default renders the full unfiltered list', async () => {
    const html = await renderSlot(
      import('@/app/invoices/@list/default'),
      undefined as never,
    );

    expect(
      rowIds(html).length,
      'Without a @list/default.tsx that renders the full list, a direct visit to /invoices/inv_001 leaves @list unmatched and the route 404s. The default must render every invoice.',
    ).toBe(TOTAL_INVOICES);
    expect(
      html,
      'The @list default should render the same header as the page, including the "New invoice" link (data-testid="new-invoice-link").',
    ).toContain('data-testid="new-invoice-link"');
  });
});

// Requirement 6 — a missing invoice id renders the 404 surface (notFound()),
// not a thrown application error.
describe('a missing invoice id triggers the 404 surface', () => {
  it('the detail page calls notFound() for an unknown id', async () => {
    const { default: DetailPage } = await import(
      '@/app/invoices/@detail/[id]/page'
    );

    let digest: unknown;
    try {
      await DetailPage({
        params: Promise.resolve({ id: 'inv_does_not_exist' }),
      } as never);
      throw new Error(
        'A missing invoice id should call notFound(); the detail page returned markup instead of triggering the 404 surface.',
      );
    } catch (error) {
      digest = (error as { digest?: unknown })?.digest;
    }

    // notFound() throws a special error whose digest Next recognises as a 404.
    expect(
      digest,
      'The missing-invoice case must go through notFound() (which throws NEXT_HTTP_ERROR_FALLBACK;404), not a plain Error or a rendered fallback.',
    ).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
  });
});
