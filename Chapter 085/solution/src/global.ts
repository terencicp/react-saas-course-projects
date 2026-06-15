import type { formats } from '@/i18n/formats';
import type { routing } from '@/i18n/routing';
import type messages from '@/messages/en-US.json';

// Augment next-intl's `AppConfig` so `t()` keys, `useFormatter` preset names, and
// the `Locale` union are all type-checked against the real catalog/formats/routing.
// `en-US.json` is the source contract every other locale must mirror.
declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
    Formats: typeof formats;
  }
}
