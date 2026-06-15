import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// --- Module stubs ------------------------------------------------------------
// `table.tsx` imports the lifecycle Server Actions, whose chain
// (`actions.ts` → `authed-action.ts` → `session.ts`/`store.ts`, plus
// `queries.ts`) opens with `import 'server-only'` and reaches for
// `revalidatePath`/`cookies` at module load. None of that has a node build, so
// stub the request-time machinery to let the client table import cleanly in this
// node-env test exactly as it would inside a client bundle. The behavior under
// test is the formatted value cells, never the actions.
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
// The table renders a locale-aware `<Link>` from `@/i18n/navigation`, whose
// `createNavigation` pulls `next/navigation` — a subpath node cannot resolve
// outside the Next bundler. Stub the student module to a passthrough `<a>`; the
// link is not the subject, the date/amount/due cells are.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: unknown; href: string }) =>
    createElement('a', { href }, children as never),
  redirect: () => {},
  usePathname: () => '/invoices',
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  getPathname: () => '/invoices',
}));

// --- Fixtures ----------------------------------------------------------------

// The two seeded DST-spanning instants. Both are stored as the same UTC moment
// (18:00Z) on either side of the DST line, so the only thing that decides the
// wall-clock the viewer sees is the `timeZone` handed to the formatter.
const JULY_18Z = Date.parse('2026-07-01T18:00:00.000Z'); // BST / EDT side
const JAN_18Z = Date.parse('2026-01-01T18:00:00.000Z'); // GMT / EST side

// A stable per-render clock so the relative-due column is deterministic.
const NOW_MS = Date.parse('2026-07-01T00:00:00.000Z');

// A serializable invoice row (the `toInvoiceRow` projection the page threads to
// the client table): Temporal instances ride as `createdAtMs` epoch millis.
const makeRow = (over: {
  id?: string;
  currency: string;
  createdAtMs: number;
}) => ({
  id: over.id ?? 'inv-test',
  orgId: 'org-acme',
  number: 'INV-0001',
  customerName: 'Acme Corp',
  status: 'sent' as const,
  amountMinor: 123_456,
  total: '1234.56',
  currency: over.currency,
  createdAtMs: over.createdAtMs,
  dueDateISO: '2026-07-04',
  deletedAt: null,
  archivedAt: null,
  version: 1,
});

// --- Render driver -----------------------------------------------------------
// Render the real client `InvoicesTable` inside a `NextIntlClientProvider`
// carrying the chosen locale, the project's shared `formats` presets, and the
// viewer's `timeZone` — the same context the locale layout supplies in the app.
// `renderToStaticMarkup` gives the first-paint HTML; the formatted value cells
// (`invoice-date`, `invoice-amount`, `invoice-due-relative`) carry the
// observable wall-clock / currency / relative-phrase output the lesson targets.
const renderTable = async (args: {
  locale: string;
  timeZone: string;
  rows: ReturnType<typeof makeRow>[];
  dueInDaysById: Record<string, number>;
}): Promise<string> => {
  const { NextIntlClientProvider } = await import('next-intl');
  const { InvoicesTable } = await import('@/app/[locale]/(app)/invoices/table');
  const { formats } = await import('@/i18n/formats');
  const messages =
    args.locale === 'fr-FR'
      ? (await import('@/messages/fr-FR.json')).default
      : (await import('@/messages/en-US.json')).default;

  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider as never,
      {
        locale: args.locale,
        messages,
        formats,
        timeZone: args.timeZone,
        now: new Date(NOW_MS),
      } as never,
      createElement(
        InvoicesTable as never,
        {
          rows: args.rows,
          view: 'active',
          role: 'admin',
          timeZone: args.timeZone,
          nowMs: NOW_MS,
          dueInDaysById: args.dueInDaysById,
        } as never,
      ),
    ),
  );
};

// CLDR-formatted numbers use narrow / no-break spaces (U+202F, U+00A0) as group
// and currency separators; renderToStaticMarkup emits them literally. Normalize
// them to a plain space so assertions read the way the lesson states them.
const normalizeSpaces = (s: string): string => s.replace(/[   ]/g, ' ').trim();

// Pull the visible text of a value cell by its `data-testid`, stripping nested
// tags. Returns null when the cell is absent (e.g. the date/due columns the
// starter table has not added yet) so the failure names the missing cell.
const cellText = (html: string, testid: string): string | null => {
  const match = html.match(
    new RegExp(`data-testid="${testid}"[^>]*>([\\s\\S]*?)</td>`),
  );
  const inner = match?.[1];
  if (inner === undefined) {
    return null;
  }
  return normalizeSpaces(inner.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
};

// =============================================================================
// Requirement 1 — every invoice date renders in the viewer's profile timezone
// =============================================================================
describe('Requirement 1 — invoice dates render in the viewer profile timezone', () => {
  it('an America/New_York viewer sees the wall-clock for that zone (EDT/EST), not UTC', async () => {
    const julyHtml = await renderTable({
      locale: 'en-US',
      timeZone: 'America/New_York',
      rows: [makeRow({ currency: 'USD', createdAtMs: JULY_18Z })],
      dueInDaysById: { 'inv-test': 3 },
    });
    const janHtml = await renderTable({
      locale: 'en-US',
      timeZone: 'America/New_York',
      rows: [makeRow({ currency: 'USD', createdAtMs: JAN_18Z })],
      dueInDaysById: { 'inv-test': 3 },
    });

    const julyDate = cellText(julyHtml, 'invoice-date');
    const janDate = cellText(janHtml, 'invoice-date');

    expect(
      julyDate,
      'No invoice-date cell rendered. The table must add a date column that formats new Date(row.createdAtMs) through format.dateTime — the starter table has no date cell yet.',
    ).not.toBeNull();

    // 18:00Z on the EDT side is 2:00 PM in New York; the wall-clock proves the
    // formatter was handed the profile timeZone, not the runtime tz (UTC).
    expect(
      julyDate,
      'The date cell did not render in America/New_York. format.dateTime must be handed { timeZone } so 18:00Z renders as 2:00 PM EDT — without an explicit timeZone the formatter falls back to the runtime zone (UTC), which would show 6:00 PM.',
    ).toContain('2:00 PM');

    // 18:00Z on the EST side is 1:00 PM in New York: the same code renders a
    // different wall-clock hour across the DST line with no DST branch.
    expect(
      janDate,
      'The January instant did not render as 1:00 PM EST. Temporal.Instant + IANA zone is DST-aware by construction, so the same date cell must shift from 2:00 PM (summer) to 1:00 PM (winter) for a New York viewer with no explicit DST code.',
    ).toContain('1:00 PM');
  });
});

// =============================================================================
// Requirement 2 — the DST-spanning instants render correctly per zone
// =============================================================================
describe('Requirement 2 — the DST-spanning instants render the right wall-clock', () => {
  it('a Europe/London viewer sees 7:00 PM BST in July and 6:00 PM GMT in January', async () => {
    const julyHtml = await renderTable({
      locale: 'en-US',
      timeZone: 'Europe/London',
      rows: [makeRow({ currency: 'USD', createdAtMs: JULY_18Z })],
      dueInDaysById: { 'inv-test': 3 },
    });
    const janHtml = await renderTable({
      locale: 'en-US',
      timeZone: 'Europe/London',
      rows: [makeRow({ currency: 'USD', createdAtMs: JAN_18Z })],
      dueInDaysById: { 'inv-test': 3 },
    });

    expect(
      cellText(julyHtml, 'invoice-date'),
      'A London viewer did not see 7:00 PM for the July instant. 18:00Z is 19:00 BST (UTC+1) — the date cell must be handed timeZone: "Europe/London" so summer renders as 7:00 PM.',
    ).toContain('7:00 PM');

    expect(
      cellText(janHtml, 'invoice-date'),
      'A London viewer did not see 6:00 PM for the January instant. 18:00Z is 18:00 GMT (UTC+0) — the same cell must shift to 6:00 PM in winter, proving the IANA zone (not a hard-coded offset) drives the wall-clock.',
    ).toContain('6:00 PM');
  });

  it('the same two instants read as 2:00 PM EDT / 1:00 PM EST for an America/New_York viewer', async () => {
    const julyHtml = await renderTable({
      locale: 'en-US',
      timeZone: 'America/New_York',
      rows: [makeRow({ currency: 'USD', createdAtMs: JULY_18Z })],
      dueInDaysById: { 'inv-test': 3 },
    });
    const janHtml = await renderTable({
      locale: 'en-US',
      timeZone: 'America/New_York',
      rows: [makeRow({ currency: 'USD', createdAtMs: JAN_18Z })],
      dueInDaysById: { 'inv-test': 3 },
    });

    expect(
      cellText(julyHtml, 'invoice-date'),
      'The July instant did not read 2:00 PM for a New York viewer. The exact same UTC moment renders a different wall-clock per zone — that divergence is the whole point of threading the profile timeZone into format.dateTime.',
    ).toContain('2:00 PM');

    expect(
      cellText(janHtml, 'invoice-date'),
      'The January instant did not read 1:00 PM for a New York viewer. Both DST sides must be correct from one tz-driven call, with no per-instant DST handling.',
    ).toContain('1:00 PM');
  });
});

// =============================================================================
// Requirement 3 — each amount renders in the invoice's stored currency,
//                 formatted for the viewer's locale
// =============================================================================
describe('Requirement 3 — amounts render in the stored currency for the viewer locale', () => {
  it('a USD datum shows $1,234.56 in en-US and 1 234,56 $ (narrow symbol) in fr-FR', async () => {
    const enHtml = await renderTable({
      locale: 'en-US',
      timeZone: 'America/New_York',
      rows: [makeRow({ currency: 'USD', createdAtMs: JULY_18Z })],
      dueInDaysById: { 'inv-test': 3 },
    });
    const frHtml = await renderTable({
      locale: 'fr-FR',
      timeZone: 'Europe/Paris',
      rows: [makeRow({ currency: 'USD', createdAtMs: JULY_18Z })],
      dueInDaysById: { 'inv-test': 3 },
    });

    const enAmount = cellText(enHtml, 'invoice-amount');

    expect(
      enAmount,
      'No formatted amount cell rendered. The amount must go through format.number(row.amountMinor / 100, "currency", { currency: row.currency }) — the starter table prints the raw "{currency} {total}" string instead.',
    ).not.toBeNull();

    expect(
      enAmount,
      'The USD amount did not format as $1,234.56 for en-US. format.number must divide amountMinor by 100 and apply the currency preset — a raw "USD 1234.56" means the formatter seam is not wired.',
    ).toBe('$1,234.56');

    // The SAME USD datum, viewed in fr-FR: the currency tag is data on the row,
    // so it stays USD; only the formatting reflows to the viewer's locale, and
    // narrowSymbol renders "$", not "US$" or "USD".
    expect(
      cellText(frHtml, 'invoice-amount'),
      'The USD datum did not reflow to 1 234,56 $ in fr-FR. The currency code rides at the call site as data (currency: row.currency), so a USD row stays USD across locales; only the grouping/decimal and symbol placement follow the viewer locale, and currencyDisplay: "narrowSymbol" shows "$" rather than "US$".',
    ).toBe('1 234,56 $');
  });

  it('an EUR datum shows 1 234,56 € in fr-FR — currency is data, never inferred from locale', async () => {
    const frHtml = await renderTable({
      locale: 'fr-FR',
      timeZone: 'Europe/Paris',
      rows: [makeRow({ currency: 'EUR', createdAtMs: JULY_18Z })],
      dueInDaysById: { 'inv-test': 3 },
    });

    expect(
      cellText(frHtml, 'invoice-amount'),
      'An EUR invoice did not format as 1 234,56 € in fr-FR. The currency comes from row.currency, never from the viewer locale — the same fr-FR viewer must see € for a EUR row and $ for a USD row.',
    ).toBe('1 234,56 €');
  });
});

// =============================================================================
// Requirement 4 — the relative-due column reads naturally per locale
// =============================================================================
describe('Requirement 4 — the relative-due column reads naturally per locale', () => {
  it('reads "in 3 days" / "5 days ago" in en-US', async () => {
    const futureHtml = await renderTable({
      locale: 'en-US',
      timeZone: 'America/New_York',
      rows: [makeRow({ currency: 'USD', createdAtMs: JULY_18Z })],
      dueInDaysById: { 'inv-test': 3 },
    });
    const pastHtml = await renderTable({
      locale: 'en-US',
      timeZone: 'America/New_York',
      rows: [makeRow({ currency: 'USD', createdAtMs: JULY_18Z })],
      dueInDaysById: { 'inv-test': -5 },
    });

    const future = cellText(futureHtml, 'invoice-due-relative');

    expect(
      future,
      'No relative-due cell rendered. The table must add a due column that feeds the server-computed day delta to format.relativeTime — the starter table has no due column yet.',
    ).not.toBeNull();

    expect(
      future,
      'A +3 day due date did not read "in 3 days". format.relativeTime(addDays(now, dueInDaysById[id]), { now, unit: "day" }) applies CLDR numeric: "auto" internally, so a future delta reads "in N days".',
    ).toBe('in 3 days');

    expect(
      cellText(pastHtml, 'invoice-due-relative'),
      'A -5 day (overdue) due date did not read "5 days ago". A negative delta must read in the past tense for the viewer locale.',
    ).toBe('5 days ago');
  });

  it('reads "dans 3 jours" / "il y a 5 jours" in fr-FR', async () => {
    const futureHtml = await renderTable({
      locale: 'fr-FR',
      timeZone: 'Europe/Paris',
      rows: [makeRow({ currency: 'EUR', createdAtMs: JULY_18Z })],
      dueInDaysById: { 'inv-test': 3 },
    });
    const pastHtml = await renderTable({
      locale: 'fr-FR',
      timeZone: 'Europe/Paris',
      rows: [makeRow({ currency: 'EUR', createdAtMs: JULY_18Z })],
      dueInDaysById: { 'inv-test': -5 },
    });

    expect(
      cellText(futureHtml, 'invoice-due-relative'),
      'A +3 day due date did not read "dans 3 jours" in fr-FR. The relative phrase must come from format.relativeTime (locale-driven CLDR), never a hand-built "in N days" string that ignores the viewer language.',
    ).toBe('dans 3 jours');

    expect(
      cellText(pastHtml, 'invoice-due-relative'),
      'A -5 day due date did not read "il y a 5 jours" in fr-FR. The past-tense relative phrase must localize too — proving the column goes through the formatter seam, not a manual template.',
    ).toBe('il y a 5 jours');
  });
});
