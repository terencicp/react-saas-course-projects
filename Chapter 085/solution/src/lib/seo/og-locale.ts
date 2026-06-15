import type { Locale } from '@/lib/i18n/supported';

// Open Graph's `og:locale` uses the underscore form (`fr_FR`), not the BCP 47
// hyphen form (`fr-FR`) the rest of the app speaks. This is the single converter.
export const bcp47ToOgLocale = (locale: Locale): string =>
  locale.replace('-', '_');
