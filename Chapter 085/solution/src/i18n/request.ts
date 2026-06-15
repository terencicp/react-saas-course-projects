import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { formats } from '@/i18n/formats';
import { routing } from '@/i18n/routing';

// The request-config seam: next-intl evaluates this once per request (via
// `getMessages`/`getTranslations`/`getFormatter`, including during the static
// prerender of every `generateStaticParams` locale). The locale is validated
// against `routing.locales` (never trusts the raw segment) and messages are
// dynamic-imported so each catalog code-splits.
//
// The profile `timeZone` is the session seam, but it is read at each formatter
// call site (`getCurrentUserTimeZone()`, inside the Suspense-guarded page),
// NOT here: reading `cookies()` in the request config runs during static
// prerender and fails it ("Uncached data was accessed outside of <Suspense>") —
// the same class of failure the plan already forbids for `now: new Date()`. The
// locked decision makes `timeZone` mandatory at every `format.dateTime` call, so
// the config never needs a default zone. Keeping the config prerender-safe is
// what lets the static locale shell build.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const messages = (await import(`../messages/${locale}.json`)).default;

  return { locale, messages, formats };
});
