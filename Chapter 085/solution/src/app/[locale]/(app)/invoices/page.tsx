import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { SearchParams } from 'nuqs/server';
import { ActiveFilterChips } from '@/app/[locale]/(app)/invoices/active-filter-chips';
import { Pagination } from '@/app/[locale]/(app)/invoices/pagination';
import { InvoicesTable } from '@/app/[locale]/(app)/invoices/table';
import { Toolbar } from '@/app/[locale]/(app)/invoices/toolbar';
import { ViewTabs } from '@/app/[locale]/(app)/invoices/view-tabs';
import { routing } from '@/i18n/routing';
import { listInvoices, toInvoiceRow } from '@/lib/invoices/queries';
import { invoiceListSearchParamsCache } from '@/lib/invoices/search-params';
import { Temporal } from '@/lib/temporal';
import { getCurrentUserTimeZone } from '@/lib/user-time';
import { getSession } from '@/server/session';

// S1 routes every UI string through the `invoices.list` catalog (heading, count,
// select prompt) and renders the count via the ICU `plural` message. S2 moves
// the date/currency/relative-due cells onto the formatter seam: the profile
// `timeZone` is read here on the server (the request config carries no default
// tz — prerender safety) and threaded into the client table, where each
// `format.dateTime`/`format.number` call is handed the tz and the row's own
// currency. The relative-due day delta is the one Temporal arithmetic beat
// (`Temporal.Now.plainDateISO(tz).until(dueDate)`); it is computed server-side
// per row and rendered through `format.relativeTime` in the table.

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
};

const InvoicesPage = async ({ params, searchParams }: PageProps) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations('invoices.list');

  const parsed = await invoiceListSearchParamsCache.parse(searchParams);
  const session = await getSession();

  const { rows, nextCursor, hasPrev } = listInvoices({
    orgId: session.orgId,
    role: session.role,
    ...parsed,
  });

  // The viewer's profile tz drives every wall-clock cell; read it once. A stable
  // per-render `now` (read after the dynamic tz, so the clock trails a request
  // source — Cache Components safe) anchors the relative-due column. The day
  // delta is integer days between today (in the profile tz) and the calendar
  // due date — the lesson's single Temporal arithmetic call.
  const tz = await getCurrentUserTimeZone();
  const nowMs = Date.now();
  const today = Temporal.Now.plainDateISO(tz);
  const dueInDaysById = Object.fromEntries(
    rows.map((row) => [
      row.id,
      today.until(row.dueDate, { largestUnit: 'day' }).days,
    ]),
  );

  return (
    <div data-testid="invoices-page" className="space-y-4">
      <h1 className="text-xl font-semibold">{t('title')}</h1>

      {/* Layout invariant: exactly two grid children — the list region and the
          detail/empty region (stacked on mobile, side by side at desktop). The
          list region is one element; toolbar/table/pagination nest inside it. */}
      <div
        data-testid="invoices-grid"
        className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]"
      >
        <div data-testid="invoices-list" className="space-y-4">
          {/* The count is an ICU `plural` — the right CLDR category per locale
              (en-US =0/one/other, fr-FR adds the `many` branch), never a
              ternary. */}
          <p
            data-testid="invoice-count"
            className="text-sm text-muted-foreground"
          >
            {t('count', { count: rows.length })}
          </p>
          <ViewTabs parsed={parsed} role={session.role} />
          <Toolbar parsed={parsed} />
          <ActiveFilterChips parsed={parsed} />
          {/* Project rows to a serializable shape: Temporal instances can't
              cross the RSC → Client boundary. The tz, the stable `now`, and the
              per-row day delta ride alongside so the client formatter renders
              the right wall-clock and relative phrase. */}
          <InvoicesTable
            rows={rows.map(toInvoiceRow)}
            view={parsed.view}
            role={session.role}
            timeZone={tz}
            nowMs={nowMs}
            dueInDaysById={dueInDaysById}
          />
          <Pagination
            cursor={parsed.cursor}
            nextCursor={nextCursor}
            hasPrev={hasPrev}
          />
        </div>

        <aside className="rounded-lg border p-4 text-sm text-muted-foreground">
          {t('selectPrompt')}
        </aside>
      </div>
    </div>
  );
};

export default InvoicesPage;
