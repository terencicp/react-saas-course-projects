import type { SearchParams } from 'nuqs/server';
import { ActiveFilterChips } from '@/app/(app)/invoices/active-filter-chips';
import { InvoiceChat } from '@/app/(app)/invoices/invoice-chat';
import { Pagination } from '@/app/(app)/invoices/pagination';
import { InvoicesTable } from '@/app/(app)/invoices/table';
import { TokenUsagePanel } from '@/app/(app)/invoices/token-usage-panel';
import { Toolbar } from '@/app/(app)/invoices/toolbar';
import { ViewTabs } from '@/app/(app)/invoices/view-tabs';
import { listInvoices } from '@/lib/invoices/queries';
import { invoiceListSearchParamsCache } from '@/lib/invoices/search-params';
import { getSession } from '@/server/session';
import { organizations } from '@/server/store';

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const InvoicesPage = async ({ searchParams }: PageProps) => {
  const parsed = await invoiceListSearchParamsCache.parse(searchParams);
  const session = await getSession();

  const { rows, nextCursor, hasPrev } = listInvoices({
    orgId: session.orgId,
    role: session.role,
    ...parsed,
  });

  const orgName =
    organizations.find((org) => org.id === session.orgId)?.name ??
    session.orgId;

  return (
    <div data-testid="invoices-page" className="space-y-4">
      <h1 className="text-xl font-semibold">Invoices</h1>

      {/* Layout invariant: exactly two grid children — the list region and the
          chat rail (stacked on mobile, side by side at desktop). The rail is one
          <aside> slot; the usage panel + chat nest inside it, never as extra
          grid children. */}
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

        <aside className="space-y-4 self-start">
          <TokenUsagePanel />
          <InvoiceChat orgName={orgName} />
        </aside>
      </div>
    </div>
  );
};

export default InvoicesPage;
