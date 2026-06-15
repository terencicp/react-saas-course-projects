import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

// Locale is resolved ONCE here, by next-intl's middleware (the renamed Next 16
// `proxy.ts`). It runs the five-step negotiation chain — URL prefix → session
// `NEXT_LOCALE` cookie → `Accept-Language` best-match → default — and rewrites
// unprefixed paths so the `[locale]` segment can match. Downstream code reads
// only the resolved value; no `Accept-Language` read anywhere else.
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals, the locale-agnostic `/inspector` route, and
  // any path with a file extension. `inspector` is excluded because next-intl's
  // `as-needed` middleware rewrites every non-locale path to the default locale
  // (`/inspector` → `/en-US/inspector`), which has no route and 404s — the
  // inspector deliberately lives outside the `[locale]` segment.
  matcher: ['/((?!api|_next|_vercel|inspector|.*\\..*).*)'],
};
