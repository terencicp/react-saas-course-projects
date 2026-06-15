import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { formats } from '@/i18n/formats';
import { routing } from '@/i18n/routing';

// TODO(L2) — resolve locale via hasLocale, dynamic-import the locale's messages,
// timeZone from session, formats (no now: new Date() — breaks Cache Components
// prerender)
//
// Minimal starter config: the `locale` is validated against `routing.locales`
// (so it agrees with `setRequestLocale`), but EVERY locale still resolves to the
// en-US catalog — so `start/` boots and routes the carry-in list, yet the prefix
// has no visible effect (the en-GB/fr-FR catalogs are still empty stubs). S1
// replaces this with the real per-locale dynamic import + the session `timeZone`.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const messages = (await import('../messages/en-US.json')).default;

  return { locale, messages, formats };
});
