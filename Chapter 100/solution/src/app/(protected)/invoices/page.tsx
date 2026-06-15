import type { SearchParams } from 'nuqs/server';

import { ActiveFilterChips } from '@/app/(protected)/invoices/active-filter-chips';
import { Pagination } from '@/app/(protected)/invoices/pagination';
import { InvoicesTable } from '@/app/(protected)/invoices/table';
import { Toolbar } from '@/app/(protected)/invoices/toolbar';
import { ViewTabs } from '@/app/(protected)/invoices/view-tabs';
import { requireOrgUser } from '@/lib/auth';
import { listInvoices } from '@/lib/invoices/queries';
import { invoiceListSearchParamsCache } from '@/lib/invoices/search-params';

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const InvoicesPage = async ({ searchParams }: PageProps) => {
  const parsed = await invoiceListSearchParamsCache.parse(searchParams);
  const { orgId, role } = await requireOrgUser();

  const { rows, nextCursor, hasPrev } = await listInvoices({
    orgId,
    role,
    ...parsed,
  });

  return (
    <div data-testid="invoices-page" className="space-y-4 px-6 py-10">
      <h1 className="text-xl font-semibold">Invoices</h1>

      {/* Layout invariant: exactly two grid children — the list region and the
          detail/empty region (stacked on mobile, side by side at desktop). */}
      <div
        data-testid="invoices-grid"
        className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]"
      >
        <div className="space-y-4">
          <ViewTabs parsed={parsed} role={role} />
          <Toolbar parsed={parsed} />
          <ActiveFilterChips parsed={parsed} />
          <InvoicesTable rows={rows} view={parsed.view} role={role} />
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
