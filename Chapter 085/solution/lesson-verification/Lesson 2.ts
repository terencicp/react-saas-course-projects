import { readFileSync } from 'node:fs';
import { createTranslator } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Locale } from '@/lib/i18n/supported';

// ── Module stubs ────────────────────────────────────────────────────────────
// These run in node-env, outside any Next request. The locale layout and the
// switch action reach for request-scoped APIs and server-only modules that have
// no node implementation, so we stub them. The stubs are inert helpers — every
// behavioral assertion still reads the student's own code: the layout's resolved
// `<html lang>` and the action's store + cookie writes.

// `next-intl` keeps its real exports (`hasLocale`, `createTranslator`); only the
// client provider is swapped for a passthrough so it renders without the request
// context that would otherwise demand an explicit `locale` prop in node-env.
vi.mock('next-intl', async (importActual) => {
  const actual = await importActual<typeof import('next-intl')>();
  return {
    ...actual,
    NextIntlClientProvider: ({ children }: { children?: ReactNode }) =>
      createElement('div', null, children),
  };
});

vi.mock('next-intl/server', () => ({
  setRequestLocale: () => {},
  getMessages: async () => ({}),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

// The action runs through authedAction → getSession → cookies(); both pull in
// `server-only` and `next/headers`, neither resolvable in node-env. The cookie
// jar is module-scoped and reset per test so the writes stay observable.
vi.mock('server-only', () => ({}));

let cookieJar = new Map<
  string,
  { value: string; options: Record<string, unknown> }
>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    // Default acting identity is org-acme:admin (a member-or-higher role), so the
    // action's RBAC gate passes.
    get: (name: string) =>
      name === 'acting-identity'
        ? { value: 'org-acme:admin' }
        : cookieJar.has(name)
          ? { value: cookieJar.get(name)?.value }
          : undefined,
    set: (
      name: string,
      value: string,
      options: Record<string, unknown> = {},
    ) => {
      cookieJar.set(name, { value, options });
    },
  }),
}));

// Lesson 2 — Wire next-intl and ship three catalogs.
//
// Node-env, no DOM. Every assertion targets an observable the student's code
// produces: the strings each catalog renders through next-intl's ICU engine
// (the same `createTranslator` the provided inspector uses, the same engine
// `t()`/`useTranslations` run on), the `<html lang>` the locale layout paints,
// the source shape that proves the surface reads from the catalog rather than
// hard-coded JSX, and the store + cookie writes the locale-switch action makes.
//
// `@/` resolves via vite-tsconfig-paths; the catalogs are loaded through the
// public `@/messages/*.json` modules, exactly as the inspector imports them.

// Read a project source file relative to start|solution root, for the source-
// shape assertions. The base stays a URL so spaces in the path are handled.
const readSource = (rel: string) =>
  readFileSync(new URL(rel, new URL('../', import.meta.url)), 'utf8');

// Build a namespaced translator straight off a catalog. This is the exact ICU
// pipeline the rendered surface runs — proving the catalog renders the right
// per-locale string is proving the cell does.
const listTranslator = (locale: Locale, messages: Record<string, unknown>) =>
  createTranslator({
    locale,
    messages,
    namespace: 'invoices.list',
  }) as unknown as (key: string, values?: Record<string, number>) => string;

// Catalogs are imported lazily inside each suite so a still-stubbed start catalog
// (`{ "_todo": … }`) produces a clear assertion failure here, not a load-time crash.
const loadCatalog = async (locale: Locale): Promise<Record<string, unknown>> =>
  (await import(`@/messages/${locale}.json`)).default;

describe('Requirement 1 — every UI string renders from the catalog and swaps per locale', () => {
  it('renders the invoices-list strings in English from en-US and in French from fr-FR', async () => {
    const en = listTranslator('en-US', await loadCatalog('en-US'));
    const fr = listTranslator('fr-FR', await loadCatalog('fr-FR'));

    // The en-US source-of-truth is provided; this anchors the English side.
    expect(
      en('title'),
      'invoices.list.title is missing or wrong in en-US.json — the heading must come from the catalog.',
    ).toBe('Invoices');

    // fr-FR.json starts as a `{ "_todo": … }` stub. Until it carries the full
    // French catalog these read back the key path (a MISSING_MESSAGE fallback),
    // never the French word.
    expect(
      fr('title'),
      'invoices.list.title did not render in French. Fill messages/fr-FR.json with the full French catalog (title → "Factures"); a stub catalog falls back to the key path.',
    ).toBe('Factures');

    expect(
      fr('selectPrompt'),
      'invoices.list.selectPrompt is not translated in fr-FR.json. The detail-pane prompt must read in French at /fr-FR/invoices.',
    ).toBe('Sélectionnez une facture pour voir son détail.');

    expect(
      fr('columns.customer'),
      'invoices.list.columns.customer is not translated in fr-FR.json. Every column header must come from the catalog and swap with the locale.',
    ).toBe('Client');

    // The status cell routes the raw status value through t(`status.<value>`),
    // so the French status label is the observable proof it is catalog-driven.
    expect(
      fr('status.sent'),
      'invoices.list.status.sent is not translated in fr-FR.json. The status cell renders t(`status.<value>`) — the French label proves the cell is not the raw `capitalize`d value.',
    ).toBe('Envoyée');

    // Same keys, different words: the surface swaps language end-to-end.
    expect(
      fr('columns.amount'),
      'The French amount-column header equals the English one — the fr-FR catalog has not diverged from en-US for this key.',
    ).not.toBe(en('columns.amount'));
  });

  it('routes the invoices surface through t() rather than hard-coded JSX literals', () => {
    const table = readSource('src/app/[locale]/(app)/invoices/table.tsx');
    const page = readSource('src/app/[locale]/(app)/invoices/page.tsx');

    // Source shape: the heading and column headers must be read through the
    // translator, not painted as English literals.
    expect(
      /columns\.number/.test(table) && /columns\.customer/.test(table),
      'table.tsx does not read its column headers through t("columns.*"). Replace the hard-coded <th>Number</th>/<th>Customer</th> JSX with t("columns.number")/t("columns.customer").',
    ).toBe(true);

    expect(
      />\s*Number\s*</.test(table),
      'table.tsx still hard-codes the English column header <th>Number</th>. Every header must come from the catalog so it swaps at /fr-FR/invoices.',
    ).toBe(false);

    expect(
      /t\(\s*['"`]title['"`]\s*\)/.test(page),
      'page.tsx does not render the heading through t("title"). Replace the hard-coded <h1>Invoices</h1> with the catalog title.',
    ).toBe(true);
  });
});

describe('Requirement 2 — the count fires the right CLDR plural category per locale', () => {
  it('renders en-US =0/one/other across 0/1/5/1000000', async () => {
    const en = listTranslator('en-US', await loadCatalog('en-US'));

    expect(
      en('count', { count: 0 }),
      'en-US count at 0 is not the =0 exact-match branch. The ICU message needs "=0 {No invoices}".',
    ).toBe('No invoices');

    expect(
      en('count', { count: 1 }),
      'en-US count at 1 is not the `one` branch ("1 invoice"). A ternary or an `other`-only message mistranslates the singular.',
    ).toBe('1 invoice');

    expect(
      en('count', { count: 5 }).startsWith('5'),
      'en-US count at 5 is not the `other` branch. It should read "5 invoices".',
    ).toBe(true);
    expect(en('count', { count: 5 })).toContain('invoice');
  });

  it('renders fr-FR =0/one/many across 0/1/5/1000000, including the `many` branch', async () => {
    const fr = listTranslator('fr-FR', await loadCatalog('fr-FR'));

    expect(
      fr('count', { count: 0 }),
      'fr-FR count at 0 is not "Aucune facture". The French message needs the =0 exact-match override.',
    ).toBe('Aucune facture');

    // French groups 1 with `one`.
    expect(
      fr('count', { count: 1 }),
      'fr-FR count at 1 is not the `one` branch ("1 facture").',
    ).toBe('1 facture');

    const five = fr('count', { count: 5 });
    expect(
      five.includes('factures') && !five.includes('de factures'),
      'fr-FR count at 5 is not the plain plural ("5 factures"). It must not pick up the `many` ("de factures") wording.',
    ).toBe(true);

    // The load-bearing case: CLDR gives French a `many` category for large
    // numbers ("1 000 000 de factures"). A message shipping only one/other
    // silently drops the "de" and mistranslates this.
    const million = fr('count', { count: 1_000_000 });
    expect(
      million.includes('de factures'),
      'fr-FR count at 1000000 did not fire the `many` branch ("… de factures"). CLDR routes large French numbers through `many`; an ICU message with only one/other loses it. Add `many {# de factures}` to the French count message.',
    ).toBe(true);
  });
});

describe('Requirement 3 — <html lang> matches the URL prefix on every locale path', () => {
  const renderLayoutLang = async (locale: string): Promise<string> => {
    const { default: LocaleLayout } = await import('@/app/[locale]/layout');
    const element = await LocaleLayout({
      children: null,
      params: Promise.resolve({ locale }),
    });
    const html = renderToStaticMarkup(element);
    return html.match(/<html[^>]*\blang="([^"]+)"/)?.[1] ?? '';
  };

  it('drives <html lang> from the resolved locale param, not a fixed value', async () => {
    expect(
      await renderLayoutLang('fr-FR'),
      '<html lang> at /fr-FR/… is not "fr-FR". The layout must render <html lang={locale}> from the resolved URL param, never a hard-coded "en-US".',
    ).toBe('fr-FR');

    expect(
      await renderLayoutLang('en-US'),
      '<html lang> for the en-US path is not "en-US". Drive lang from the resolved param.',
    ).toBe('en-US');

    expect(
      await renderLayoutLang('en-GB'),
      '<html lang> at /en-GB/… is not "en-GB". A hard-coded lang stops matching once the prefix changes.',
    ).toBe('en-GB');
  });
});

describe('Requirement 4 — the locale-switch action writes the store profile and the NEXT_LOCALE cookie', () => {
  // Reset the jar before each case so one test's cookie never leaks into the next.
  const callSwitch = async (locale: string) => {
    cookieJar = new Map();
    const { setLocaleAction } = await import(
      '@/app/[locale]/(app)/invoices/actions'
    );
    const formData = new FormData();
    formData.set('locale', locale);
    return setLocaleAction(null, formData);
  };

  it('returns ok and sets NEXT_LOCALE to the chosen locale with a path-/ lax cookie', async () => {
    const result = await callSwitch('fr-FR');

    expect(
      result.ok,
      'setLocaleAction did not return ok for a valid locale. The body still returns err("internal", "Not implemented") — fill it to write the profile and cookie, then return ok(null).',
    ).toBe(true);

    const cookie = cookieJar.get('NEXT_LOCALE');
    expect(
      cookie?.value,
      'The action did not set the NEXT_LOCALE cookie. Write (await cookies()).set("NEXT_LOCALE", input.locale, …) so the URL and the negotiation chain agree on the choice.',
    ).toBe('fr-FR');

    expect(
      cookie?.options,
      'The NEXT_LOCALE cookie is missing path:"/" and sameSite:"lax". It must apply site-wide and survive cross-site navigations without breaking OAuth callbacks.',
    ).toMatchObject({ path: '/', sameSite: 'lax' });
  });

  it('updates the acting store user’s profile locale', async () => {
    // org-acme:admin is user-acme-admin, seeded as en-US. Switch to a distinct
    // locale so the assertion proves a fresh write, not the seed or a leftover.
    await callSwitch('en-GB');

    const { users } = await import('@/server/store');
    const acting = users.find((u) => u.id === 'user-acme-admin');

    expect(
      acting?.locale,
      'The action did not update the store user’s profile locale. Call setUserLocale(ctx.userId, input.locale) so getRequestConfig’s profile seam reads the new choice.',
    ).toBe('en-GB');
  });
});
