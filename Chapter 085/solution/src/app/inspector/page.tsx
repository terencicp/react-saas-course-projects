import type { Route } from 'next';
import { headers } from 'next/headers';
import NextLink from 'next/link';
import { getFormatter } from 'next-intl/server';
import {
  forceVersionDrift,
  resetAndReseed,
  setLocaleOverride,
  setTimeZoneOverride,
  switchIdentity,
} from '@/app/inspector/actions';
import { PluralProbe } from '@/app/inspector/plural-probe';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { type Locale, SUPPORTED_LOCALES } from '@/lib/i18n/supported';
import { activeFilter, archivedFilter } from '@/lib/invoices/scoped-query';
import enGB from '@/messages/en-GB.json';
import enUS from '@/messages/en-US.json';
import frFR from '@/messages/fr-FR.json';
import { getSession } from '@/server/session';
import { auditLogs, invoices, users } from '@/server/store';

// The inspector is the i18n verification surface. It is locale-agnostic, reads
// live i18n state, and is provided fully functional — not student work. The DST,
// currency, and plural panels render correctly once the formatter + catalog seams
// are wired (S2/S1); the hreflang + sitemap panels fill in after S3. That
// progression is expected, not a failure.

// A few representative amounts (minor units) for the currency-by-data grid.
const CURRENCY_PROBE_AMOUNTS = [
  { minor: 123_456, currency: 'USD' },
  { minor: 123_456, currency: 'GBP' },
  { minor: 123_456, currency: 'EUR' },
];

// Common IANA zones for the tz override.
const TZ_OPTIONS = [
  'America/New_York',
  'Europe/London',
  'Europe/Paris',
  'Pacific/Auckland',
  'UTC',
];

// Hand the probe each locale's full catalog, falling back to en-US when a
// catalog is empty (the scaffold/start state) so the probe never throws
// `MISSING_MESSAGE` before the catalogs are filled (S1).
const RAW_CATALOGS: Record<Locale, Record<string, unknown>> = {
  'en-US': enUS,
  'en-GB': enGB,
  'fr-FR': frFR,
};

const pluralCatalogs = (): Record<Locale, Record<string, unknown>> => {
  const out = {} as Record<Locale, Record<string, unknown>>;
  for (const locale of SUPPORTED_LOCALES) {
    const catalog = RAW_CATALOGS[locale];
    out[locale] = catalog && Object.keys(catalog).length > 0 ? catalog : enUS;
  }
  return out;
};

// Extract `hreflang` alternates from a fetched HTML document.
const extractHreflang = (
  html: string,
): { hreflang: string; href: string }[] => {
  const rows: { hreflang: string; href: string }[] = [];
  const linkRe = /<link[^>]*rel=["']alternate["'][^>]*>/gi;
  for (const tag of html.match(linkRe) ?? []) {
    const hreflang = tag.match(/hreflang=["']([^"']+)["']/i)?.[1];
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (hreflang && href) {
      rows.push({ hreflang, href });
    }
  }
  return rows;
};

const InspectorPage = async () => {
  const session = await getSession();
  const orgRows = invoices.filter((inv) => inv.orgId === session.orgId);

  const counts = {
    total: orgRows.length,
    active: orgRows.filter(activeFilter).length,
    archived: orgRows.filter(archivedFilter).length,
    deleted: orgRows.filter((inv) => inv.deletedAt !== null).length,
  };

  const identities = users.map((u) => `${u.orgId}:${u.role}`);
  const acting = `${session.orgId}:${session.role}`;
  const recentAudit = auditLogs.slice(-20).reverse();

  // A stable, always-live target for the version-drift / two-tabs demo.
  const driftTarget =
    orgRows.find((inv) => inv.id === 'inv-0001') ?? orgRows[0];

  // The formatter, bound to the viewer's active locale for the DST panel.
  const format = await getFormatter();
  const tz = session.timeZone;
  const dstSummer = invoices.find((inv) => inv.id === 'inv-dst-summer');
  const dstWinter = invoices.find((inv) => inv.id === 'inv-dst-winter');

  // One formatter per locale for the currency grid — the same amount + currency
  // rendered under each viewer locale.
  const localeFormatters = await Promise.all(
    SUPPORTED_LOCALES.map(async (locale) => ({
      locale,
      format: await getFormatter({ locale }),
    })),
  );

  // Base URL for the hreflang/sitemap fetches — derived from the request host so
  // it works in dev and at runtime. Failures degrade to empty (e.g. at build).
  const host = (await headers()).get('host') ?? 'localhost:3000';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  const baseUrl = `${proto}://${host}`;

  const marketingPaths = ['/', '/pricing', '/features'];
  const hreflangByPath: {
    path: string;
    rows: { hreflang: string; href: string }[];
  }[] = [];
  for (const path of marketingPaths) {
    try {
      const res = await fetch(`${baseUrl}${path}`, { cache: 'no-store' });
      const html = await res.text();
      hreflangByPath.push({ path, rows: extractHreflang(html) });
    } catch {
      hreflangByPath.push({ path, rows: [] });
    }
  }

  let sitemapXml = '';
  try {
    const res = await fetch(`${baseUrl}/sitemap.xml`, { cache: 'no-store' });
    sitemapXml = await res.text();
  } catch {
    sitemapXml = '';
  }
  // Parse the sitemap per `<url>` block so each canonical `<loc>` carries the
  // per-locale `<xhtml:link rel="alternate" hreflang>` alternates Next emits
  // alongside it (three per entry) — not just the flat list of canonical URLs.
  const sitemapUrls = [...sitemapXml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(
    (block) => {
      const body = block[1] ?? '';
      const loc = body.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? '';
      const alternates = [
        ...body.matchAll(
          /<xhtml:link[^>]*hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi,
        ),
      ].map((m) => ({ hreflang: m[1] ?? '', href: m[2] ?? '' }));
      return { loc, alternates };
    },
  );

  return (
    <div data-testid="inspector-page" className="space-y-6">
      <h1 className="text-xl font-semibold">Inspector</h1>

      <section
        data-testid="row-counts"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {(
          [
            ['count-total', 'Total', counts.total],
            ['count-active', 'Active', counts.active],
            ['count-archived', 'Archived', counts.archived],
            ['count-deleted', 'Deleted', counts.deleted],
          ] as const
        ).map(([testid, label, value]) => (
          <div
            key={testid}
            data-testid={testid}
            className="rounded-lg border p-3"
          >
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="font-medium">Acting identity</h2>
        <form
          data-testid="identity-switcher"
          action={switchIdentity}
          className="flex flex-wrap items-center gap-2"
        >
          <select
            name="identity"
            defaultValue={acting}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            {identities.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline">
            Switch
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Currently acting as <span className="font-mono">{acting}</span> —
          locale <span className="font-mono">{session.locale}</span>, tz{' '}
          <span className="font-mono">{session.timeZone}</span>.
        </p>
      </section>

      <Separator />

      <section data-testid="locale-tz-override" className="space-y-3">
        <h2 className="font-medium">Locale + timezone override</h2>
        <div className="flex flex-wrap items-end gap-4">
          <form action={setLocaleOverride} className="flex items-center gap-2">
            <select
              name="locale"
              defaultValue={session.locale}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              {SUPPORTED_LOCALES.map((locale) => (
                <option key={locale} value={locale}>
                  {locale}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="outline">
              Set locale
            </Button>
          </form>
          <form
            action={setTimeZoneOverride}
            className="flex items-center gap-2"
          >
            <select
              name="timeZone"
              defaultValue={session.timeZone}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              {TZ_OPTIONS.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="outline">
              Set tz
            </Button>
          </form>
          <NextLink
            className="text-sm underline"
            href={`/${session.locale}/invoices` as Route}
          >
            Open /{session.locale}/invoices
          </NextLink>
        </div>
      </section>

      <Separator />

      <section data-testid="dst-panel" className="space-y-3">
        <h2 className="font-medium">DST proof (profile tz: {tz})</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div
            data-testid="dst-cell-bst"
            className="rounded-lg border p-3 text-sm"
          >
            <div className="text-xs text-muted-foreground">
              2026-07-01T18:00:00Z (summer)
            </div>
            <div className="font-mono">
              {dstSummer
                ? format.dateTime(
                    new Date(dstSummer.createdAt.epochMilliseconds),
                    {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: tz,
                    },
                  )
                : '—'}
            </div>
          </div>
          <div
            data-testid="dst-cell-gmt"
            className="rounded-lg border p-3 text-sm"
          >
            <div className="text-xs text-muted-foreground">
              2026-01-01T18:00:00Z (winter)
            </div>
            <div className="font-mono">
              {dstWinter
                ? format.dateTime(
                    new Date(dstWinter.createdAt.epochMilliseconds),
                    {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: tz,
                    },
                  )
                : '—'}
            </div>
          </div>
        </div>
      </section>

      <Separator />

      <section data-testid="currency-grid" className="space-y-3">
        <h2 className="font-medium">Currency by data (amount × locale)</h2>
        <table className="text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 pe-4 font-medium">Locale</th>
              {CURRENCY_PROBE_AMOUNTS.map((a) => (
                <th key={a.currency} className="py-1 pe-4 font-medium">
                  {a.currency}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {localeFormatters.map(({ locale, format: localeFormat }) => (
              <tr key={locale}>
                <td className="py-1 pe-4 font-mono text-muted-foreground">
                  {locale}
                </td>
                {CURRENCY_PROBE_AMOUNTS.map((a) => (
                  <td
                    key={a.currency}
                    data-testid="currency-cell"
                    data-locale={locale}
                    data-currency={a.currency}
                    className="py-1 pe-4 font-mono tabular-nums"
                  >
                    {localeFormat.number(a.minor / 100, {
                      style: 'currency',
                      currency: a.currency,
                      currencyDisplay: 'narrowSymbol',
                    })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">
          Each row is the same amount formatted in that locale; the currency is
          the amount&apos;s own. S2 wires this from row data.
        </p>
      </section>

      <Separator />

      <PluralProbe catalogs={pluralCatalogs()} />

      <Separator />

      <section data-testid="hreflang-panel" className="space-y-3">
        <h2 className="font-medium">Source-HTML hreflang</h2>
        {hreflangByPath.map(({ path, rows }) => (
          <div key={path} className="space-y-1">
            <div className="font-mono text-xs text-muted-foreground">
              {path}
            </div>
            {rows.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                No alternates yet (emitted by S3).
              </div>
            ) : (
              <ul className="space-y-0.5 text-xs">
                {rows.map((row) => (
                  <li
                    key={`${path}:${row.hreflang}`}
                    data-testid="hreflang-row"
                    data-path={path}
                    data-hreflang={row.hreflang}
                    className="flex gap-3 font-mono"
                  >
                    <span className="text-muted-foreground">
                      {row.hreflang}
                    </span>
                    <span>{row.href}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>

      <Separator />

      <section data-testid="sitemap-preview" className="space-y-2">
        <h2 className="font-medium">Sitemap preview</h2>
        {sitemapUrls.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            No sitemap entries yet (emitted by S3).
          </div>
        ) : (
          <ul className="space-y-2 text-xs">
            {sitemapUrls.map((entry) => (
              <li
                key={entry.loc}
                data-testid="sitemap-url"
                className="font-mono"
              >
                {entry.loc}
                {entry.alternates.length > 0 ? (
                  <ul className="ms-4 mt-0.5 space-y-0.5 text-muted-foreground">
                    {entry.alternates.map((alt) => (
                      <li
                        key={`${entry.loc}:${alt.hreflang}`}
                        data-testid="sitemap-alternate"
                        data-hreflang={alt.hreflang}
                      >
                        {alt.hreflang} → {alt.href}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="font-medium">Reset and re-seed</h2>
        <form action={resetAndReseed}>
          <Button type="submit" size="sm" variant="outline">
            Reset and re-seed
          </Button>
        </form>
      </section>

      <Separator />

      {driftTarget ? (
        <section className="space-y-3">
          <h2 className="font-medium">Force version drift</h2>
          <p className="text-xs text-muted-foreground">
            Bumps the stored <span className="font-mono">version</span> of{' '}
            <span className="font-mono">{driftTarget.number}</span> so an open
            edit form goes stale.
          </p>
          <form
            data-testid="force-version-drift"
            action={forceVersionDrift}
            className="flex items-center gap-2"
          >
            <input type="hidden" name="orgId" value={driftTarget.orgId} />
            <input type="hidden" name="id" value={driftTarget.id} />
            <Button type="submit" size="sm" variant="outline">
              Force version drift
            </Button>
          </form>
          <NextLink
            className="text-sm underline"
            href={`/invoices/${driftTarget.id}/edit` as Route}
            target="_blank"
          >
            Open in two tabs (edit this invoice)
          </NextLink>
        </section>
      ) : null}

      <Separator />

      <section className="space-y-3">
        <h2 className="font-medium">Audit log (last 20)</h2>
        <ul data-testid="audit-tail" className="space-y-1 text-sm">
          {recentAudit.length === 0 ? (
            <li className="text-muted-foreground">No audit entries yet.</li>
          ) : (
            recentAudit.map((entry) => (
              <li
                key={entry.id}
                data-testid="audit-row"
                className="flex justify-between gap-4 font-mono text-xs"
              >
                <span>{entry.action}</span>
                <span className="text-muted-foreground">{entry.subjectId}</span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
};

export default InspectorPage;
