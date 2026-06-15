import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Why this file mocks two seams instead of importing the page modules raw.
//
// The marketing `generateMetadata` exports pull in two things that cannot run
// inside a plain node/vitest process:
//
//   1. `@/i18n/navigation` re-exports next-intl's CLIENT navigation, whose
//      published ESM imports `next/navigation` extensionless. Node's ESM
//      resolver (next-intl's dist is externalized, so vite never rewrites it)
//      can't resolve that and throws "Cannot find module .../next/navigation".
//      We replace the seam with a faithful `getPathname` that reproduces the
//      project's `localePrefix: 'as-needed'` routing (default `en-US` is bare,
//      every other locale is prefixed). The provided `generateAlternates` and
//      `sitemap` call this seam; the URLs it builds are what we assert against.
//
//   2. `getTranslations` from `next-intl/server` resolves to the react-client
//      build under node and throws "not supported in Client Components" (there
//      is no RSC dispatcher). We replace it with a reader over the REAL message
//      catalogs on disk, so the title/description the student wires still come
//      from the locale's own file — the OG title for `/fr-FR/` is genuinely the
//      French string, not a stub.
//
// Everything the lesson asks the student to write — which path and locale flow
// into the alternates seam, the underscore OG-locale conversion, the
// `alternateLocale` filter, and that the `alternates`/`openGraph` blocks exist
// at all — runs as the student's own code. `bcp47ToOgLocale` is NOT mocked.
// ---------------------------------------------------------------------------

const ROOT = new URL('../', import.meta.url);

const LOCALES = ['en-US', 'en-GB', 'fr-FR'] as const;
const DEFAULT_LOCALE = 'en-US';
const APP_URL = 'https://app.example.com';

// Faithful stand-in for the provided `getPathname` under `as-needed` routing.
const getPathname = ({
  locale,
  href,
}: {
  locale: string;
  href: string;
}): string =>
  locale === DEFAULT_LOCALE ? href : `/${locale}${href === '/' ? '' : href}`;

vi.mock('@/i18n/navigation', () => ({
  getPathname,
  Link: () => null,
}));

const catalog = (locale: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(new URL(`src/messages/${locale}.json`, ROOT), 'utf8'),
  );

const dig = (obj: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (acc, key) => (acc as Record<string, unknown>)?.[key],
      obj,
    );

vi.mock('next-intl/server', () => ({
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: string;
    namespace: string;
  }) => {
    const base = dig(catalog(locale), namespace);
    return (key: string) => dig(base, key) as string;
  },
  setRequestLocale: () => {},
}));

// ---------------------------------------------------------------------------
// Drive each page's `generateMetadata` the way Next does: with `params`
// resolving to a `{ locale }` object. Returns the plain `Metadata` object the
// student's code produces (Next later renders it into <head> tags / sitemap
// XML; in node we assert the object that becomes those tags).
// ---------------------------------------------------------------------------

type Meta = {
  title?: unknown;
  description?: unknown;
  alternates?: {
    canonical?: unknown;
    languages?: Record<string, string>;
  };
  openGraph?: {
    title?: unknown;
    locale?: unknown;
    alternateLocale?: unknown;
  };
};

type MetaModule = {
  generateMetadata?: (args: {
    params: Promise<{ locale: string }>;
  }) => Promise<Meta>;
};

const PAGES = {
  home: { module: '@/app/[locale]/(marketing)/page', path: '/' },
  pricing: {
    module: '@/app/[locale]/(marketing)/pricing/page',
    path: '/pricing',
  },
  features: {
    module: '@/app/[locale]/(marketing)/features/page',
    path: '/features',
  },
} as const;

type PageKey = keyof typeof PAGES;

const metaFor = async (page: PageKey, locale: string): Promise<Meta> => {
  const mod: MetaModule = await import(PAGES[page].module);
  if (typeof mod.generateMetadata !== 'function') {
    throw new Error(
      `The ${page} marketing page exports no \`generateMetadata\`. ` +
        'Each marketing page must export one so the head carries hreflang, ' +
        'a locale-specific canonical, and per-locale OG tags.',
    );
  }
  return mod.generateMetadata({ params: Promise.resolve({ locale }) });
};

const expectedUrl = (locale: string, path: string): string =>
  APP_URL + getPathname({ locale, href: path });

// ---------------------------------------------------------------------------

describe('Requirement 1 — bidirectional, self-referenced hreflang with x-default', () => {
  for (const page of Object.keys(PAGES) as PageKey[]) {
    for (const locale of LOCALES) {
      it(`${page} @ ${locale} lists all three locales + x-default, self-referenced`, async () => {
        const languages = (await metaFor(page, locale)).alternates?.languages;

        expect(
          languages,
          `${page} @ ${locale} emits no \`alternates.languages\` — wire ` +
            'generateAlternates(<path>, resolved) into the returned metadata so ' +
            'Next renders the <link rel="alternate" hreflang> tags.',
        ).toBeTruthy();

        const keys = Object.keys(languages ?? {});

        // Bidirectional: every supported locale appears on every page...
        for (const other of LOCALES) {
          expect(
            keys,
            `${page} @ ${locale} omits the "${other}" hreflang alternate. ` +
              'hreflang must be bidirectional — every page lists every locale, ' +
              'or Google silently drops the declaration.',
          ).toContain(other);
        }

        // ...including the page's own locale (self-reference)...
        expect(
          keys,
          `${page} @ ${locale} does not self-reference its own locale. A page ` +
            'missing its own hreflang entry is dropped by Google.',
        ).toContain(locale);

        // ...plus the x-default fallback pointing at the default-locale URL.
        expect(
          keys,
          `${page} @ ${locale} has no "x-default" hreflang. x-default is the ` +
            'fallback when no alternate matches the user — point it at "/".',
        ).toContain('x-default');
        expect(
          languages?.['x-default'],
          `${page}'s x-default should resolve to the default-locale URL ("/"), ` +
            'the strongest-market fallback.',
        ).toBe(expectedUrl(DEFAULT_LOCALE, PAGES[page].path));
      });
    }
  }
});

describe('Requirement 2 — canonical is the page’s own locale-specific URL', () => {
  for (const page of Object.keys(PAGES) as PageKey[]) {
    for (const locale of LOCALES) {
      it(`${page} @ ${locale} canonical is the ${locale} URL, not the default`, async () => {
        const canonical = (await metaFor(page, locale)).alternates?.canonical;
        const expected = expectedUrl(locale, PAGES[page].path);

        expect(
          canonical,
          `${page} @ ${locale} resolved its canonical to "${String(canonical)}" ` +
            `instead of "${expected}". Canonicalizing every locale to the ` +
            'default tells Google the other locales are duplicates and kills ' +
            'their organic traffic — call generateAlternates with the RESOLVED ' +
            'locale, not the default.',
        ).toBe(expected);
      });
    }
  }

  it('a single page does not canonicalize all locales to the same URL', async () => {
    const canonicals = await Promise.all(
      LOCALES.map(
        async (l) => (await metaFor('pricing', l)).alternates?.canonical,
      ),
    );
    expect(
      new Set(canonicals).size,
      'Every locale of /pricing produced the same canonical URL — the canonical ' +
        'is collapsed to one locale. Each locale must be self-canonical.',
    ).toBe(LOCALES.length);
  });
});

describe('Requirement 3 — og:locale is the underscore form, others as og:locale:alternate', () => {
  for (const locale of LOCALES) {
    it(`home @ ${locale} sets og:locale="${locale.replace('-', '_')}" and lists the rest`, async () => {
      const og = (await metaFor('home', locale)).openGraph;

      expect(
        og,
        `home @ ${locale} returns no \`openGraph\` block — assemble one with a ` +
          'per-locale og:locale and og:locale:alternate list.',
      ).toBeTruthy();

      const underscore = locale.replace('-', '_');
      expect(
        og?.locale,
        `home @ ${locale} set og:locale to "${String(og?.locale)}". OG uses the ` +
          `underscore form ("${underscore}"), not BCP 47's hyphen — the hyphen ` +
          'is silently treated as invalid by Facebook/LinkedIn. Run the locale ' +
          'through bcp47ToOgLocale.',
      ).toBe(underscore);

      const alternates = og?.alternateLocale as string[] | undefined;
      const expectedAlternates = LOCALES.filter((o) => o !== locale).map((o) =>
        o.replace('-', '_'),
      );
      expect(
        [...(alternates ?? [])].sort(),
        `home @ ${locale} should list the OTHER locales as og:locale:alternate ` +
          `(underscore form), expected ${JSON.stringify(expectedAlternates)}. ` +
          'Filter the current locale out before mapping.',
      ).toEqual([...expectedAlternates].sort());

      expect(
        alternates?.includes(underscore),
        `home @ ${locale} listed its own locale in og:locale:alternate — the ` +
          'current locale belongs in og:locale, not the alternates.',
      ).toBe(false);
    });
  }
});

describe('Requirement 4 — sitemap has one entry per canonical path with per-locale alternates', () => {
  type SitemapEntry = {
    url: string;
    alternates?: { languages?: Record<string, string> };
  };
  let entries: SitemapEntry[];

  beforeAll(async () => {
    const mod = await import('@/app/sitemap');
    // The real default export returns `MetadataRoute.Sitemap`; read it through
    // the structural subset this suite asserts against.
    entries = mod.default() as SitemapEntry[];
  });

  it('emits exactly one <url> per canonical path (/, /pricing, /features)', () => {
    const urls = entries.map((e) => e.url).sort();
    expect(
      urls,
      'The sitemap should carry one entry per canonical marketing path — the ' +
        'modern Next-native shape (alternates ride inside each entry), not a ' +
        'separate per-locale sitemap.',
    ).toEqual(
      ['/', '/pricing', '/features']
        .map((p) => expectedUrl(DEFAULT_LOCALE, p))
        .sort(),
    );
  });

  it('each entry carries an <xhtml:link> alternate per locale', () => {
    for (const entry of entries) {
      const languages = entry.alternates?.languages ?? {};
      for (const locale of LOCALES) {
        expect(
          languages[locale],
          `The sitemap entry for "${entry.url}" is missing the "${locale}" ` +
            'alternate. Each <url> needs an <xhtml:link rel="alternate" hreflang> ' +
            'per locale.',
        ).toBeTruthy();
      }
    }
  });

  it('alternate URLs are the locale-specific paths', () => {
    const pricing = entries.find((e) => e.url.endsWith('/pricing'));
    expect(
      pricing?.alternates?.languages?.['fr-FR'],
      'The fr-FR alternate of the /pricing sitemap entry should be the ' +
        'locale-specific URL.',
    ).toBe(expectedUrl('fr-FR', '/pricing'));
  });
});
