import type { Locale } from '@/lib/i18n/supported';

// The base URL for absolute SEO URLs. No env validation in this project (the
// in-memory substrate has no `env`); production would read this from a validated
// `env.APP_URL`.
export const APP_URL = 'https://app.example.com';

type Alternates = {
  canonical: string;
  languages: Record<string, string>;
};

// TODO(L4) — build canonical (locale-specific) + languages from routing.locales + x-default
//
// The single SEO seam every marketing `generateMetadata` calls. Build the full
// set from `routing.locales` so self-reference and bidirectionality hold by
// construction: canonical is the LOCALE-SPECIFIC URL (never collapsed to the
// default — that is the duplicate-content trap), languages carries one entry per
// locale plus `x-default` -> the default-locale URL.
export const generateAlternates = (
  _pathname: string,
  _currentLocale: Locale,
): Alternates => ({
  canonical: '',
  languages: {},
});
