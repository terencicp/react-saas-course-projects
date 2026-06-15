import { defineRouting } from 'next-intl/routing';
import { SUPPORTED_LOCALES } from '@/lib/i18n/supported';

// The single routing definition. It feeds BOTH the proxy middleware
// (`createMiddleware`) and the typed navigation helpers (`createNavigation`), so
// locale routing has exactly one source of truth.
//
// `localePrefix: 'as-needed'` leaves the default locale (`en-US`) unprefixed
// (`/invoices`) and prefixes the rest (`/fr-FR/invoices`, `/en-GB/invoices`).
export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: 'en-US',
  localePrefix: 'as-needed',
});

export type Locale = (typeof routing.locales)[number];
