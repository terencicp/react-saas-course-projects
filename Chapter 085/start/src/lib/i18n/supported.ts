// The single source of truth for the locale set. Both the routing config
// (`i18n/routing.ts`) and the Zod guard on the switch action read from here, so
// adding a fourth locale is one edit in one place.
export const SUPPORTED_LOCALES = ['en-US', 'en-GB', 'fr-FR'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];
