import type { SearchParams } from 'nuqs/server';
import { ActiveFilterChips } from '@/app/(app)/invoices/active-filter-chips';
import { FetchedAtStrip } from '@/app/(app)/invoices/fetched-at-strip';
import { Pagination } from '@/app/(app)/invoices/pagination';
import { InvoicesTable } from '@/app/(app)/invoices/table';
import { Toolbar } from '@/app/(app)/invoices/toolbar';
import { ViewTabs } from '@/app/(app)/invoices/view-tabs';
import { getOrgInvoiceSummary, listInvoices } from '@/lib/invoices/queries';
import { invoiceListSearchParamsCache } from '@/lib/invoices/search-params';
import { getSession } from '@/server/session';

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const InvoicesPage = async ({ searchParams }: PageProps) => {
  const parsed = await invoiceListSearchParamsCache.parse(searchParams);
  const session = await getSession();

  // The page resolves the session and passes `orgId` in — no session/cookies call
  // ever moves inside a cached read body (the cache key stays a pure function of
  // its arguments).
  const { rows, nextCursor, hasPrev, fetchedAt } = await listInvoices({
    orgId: session.orgId,
    role: session.role,
    ...parsed,
  });
  const summary = await getOrgInvoiceSummary(session.orgId);

  return (
    <div data-testid="invoices-page" className="space-y-4">
      <h1 className="text-xl font-semibold">Invoices</h1>

      {/* The cache-state strip renders ABOVE the two-region grid — never a third
          grid child. */}
      <FetchedAtStrip
        listFetchedAt={fetchedAt}
        summaryFetchedAt={summary.fetchedAt}
      />

      {/* Layout invariant: exactly two grid children — the list region and the
          detail/empty region (stacked on mobile, side by side at desktop). */}
      <div
        data-testid="invoices-grid"
        className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]"
      >
        <div className="space-y-4">
          <ViewTabs parsed={parsed} role={session.role} />
          <Toolbar parsed={parsed} />
          <ActiveFilterChips parsed={parsed} />
          <InvoicesTable rows={rows} view={parsed.view} role={session.role} />
          <Pagination
            cursor={parsed.cursor}
            nextCursor={nextCursor}
            hasPrev={hasPrev}
          />
        </div>

        <aside className="rounded-lg border p-4 text-sm text-muted-foreground">
          Select an invoice to see its detail.
        </aside>
      </div>
    </div>
  );
};

export default InvoicesPage;
