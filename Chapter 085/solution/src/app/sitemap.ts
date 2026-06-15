import type { MetadataRoute } from 'next';
import { getPathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { APP_URL } from '@/lib/seo/alternates';

// One entry per canonical marketing path. Each carries `alternates.languages`
// mapped over `routing.locales` via `getPathname`, so Next emits an
// `<xhtml:link>` per locale. Root-level, not under `[locale]/`; absolute URLs.
const PATHS = ['/', '/pricing', '/features'] as const;

const sitemap = (): MetadataRoute.Sitemap =>
  PATHS.map((pathname) => ({
    url:
      APP_URL + getPathname({ locale: routing.defaultLocale, href: pathname }),
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [
          locale,
          APP_URL + getPathname({ locale, href: pathname }),
        ]),
      ),
    },
  }));

export default sitemap;
