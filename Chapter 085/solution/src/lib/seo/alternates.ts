import { getPathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import type { Locale } from '@/lib/i18n/supported';

// The base URL for absolute SEO URLs. No env validation in this project (the
// in-memory substrate has no `env`); production would read this from a validated
// `env.APP_URL`.
export const APP_URL = 'https://app.example.com';

type Alternates = {
  canonical: string;
  languages: Record<string, string>;
};

const absolute = (locale: Locale, pathname: string): string =>
  APP_URL + getPathname({ locale, href: pathname });

// The single SEO seam every marketing `generateMetadata` calls. Building the
// full set from `routing.locales` is what makes self-reference and
// bidirectionality hold by construction:
//   canonical = the LOCALE-SPECIFIC URL (never collapsed to the default — that
//     is the duplicate-content trap)
//   languages = one entry per locale plus `x-default` -> the default-locale URL
export const generateAlternates = (
  pathname: string,
  currentLocale: Locale,
): Alternates => ({
  canonical: absolute(currentLocale, pathname),
  languages: {
    ...Object.fromEntries(
      routing.locales.map((locale) => [locale, absolute(locale, pathname)]),
    ),
    'x-default': absolute(routing.defaultLocale, pathname),
  },
});
