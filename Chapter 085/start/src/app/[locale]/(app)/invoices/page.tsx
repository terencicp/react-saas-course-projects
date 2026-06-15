import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { SearchParams } from 'nuqs/server';
import { ActiveFilterChips } from '@/app/[locale]/(app)/invoices/active-filter-chips';
import { Pagination } from '@/app/[locale]/(app)/invoices/pagination';
import { InvoicesTable } from '@/app/[locale]/(app)/invoices/table';
import { Toolbar } from '@/app/[locale]/(app)/invoices/toolbar';
import { ViewTabs } from '@/app/[locale]/(app)/invoices/view-tabs';
import { routing } from '@/i18n/routing';
import { listInvoices, toInvoiceRow } from '@/lib/invoices/queries';
import { invoiceListSearchParamsCache } from '@/lib/invoices/search-params';
import { getSession } from '@/server/session';

// TODO(L2) — route strings through t() + counter via ICU plural
// TODO(L3) — dates in profile tz + currency from data + relative-due
//
// Starter state: the carry-in ch062 list renders in English with hard-coded
// strings and no count. S1 routes every UI string through the `invoices.list`
// catalog (heading, count via ICU plural, select prompt) and S2 moves the
// date/currency/relative-due cells onto the formatter seam (profile `timeZone`
// read here, threaded into the client table).

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
};

const InvoicesPage = async ({ params, searchParams }: PageProps) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const parsed = await invoiceListSearchParamsCache.parse(searchParams);
  const session = await getSession();

  const { rows, nextCursor, hasPrev } = listInvoices({
    orgId: session.orgId,
    role: session.role,
    ...parsed,
  });

  return (
    <div data-testid="invoices-page" className="space-y-4">
      <h1 className="text-xl font-semibold">Invoices</h1>

      {/* Layout invariant: exactly two grid children — the list region and the
          detail/empty region (stacked on mobile, side by side at desktop). The
          list region is one element; toolbar/table/pagination nest inside it. */}
      <div
        data-testid="invoices-grid"
        className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]"
      >
        <div data-testid="invoices-list" className="space-y-4">
          <ViewTabs parsed={parsed} role={session.role} />
          <Toolbar parsed={parsed} />
          <ActiveFilterChips parsed={parsed} />
          {/* Project rows to a serializable shape: Temporal instances can't
              cross the RSC → Client boundary. */}
          <InvoicesTable
            rows={rows.map(toInvoiceRow)}
            view={parsed.view}
            role={session.role}
          />
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
