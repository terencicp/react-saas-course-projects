'use client';

import { useTransition } from 'react';
import { setLocaleAction } from '@/app/[locale]/(app)/invoices/actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePathname, useRouter } from '@/i18n/navigation';
import { type Locale, SUPPORTED_LOCALES } from '@/lib/i18n/supported';

// Each locale is labelled in its OWN language — you never translate a language's
// endonym ("Français" is "Français" everywhere). Constant by design, so this
// component needs no `useTranslations` and boots before the catalogs are wired.
const LOCALE_LABELS: Record<Locale, string> = {
  'en-US': 'English (US)',
  'en-GB': 'English (UK)',
  'fr-FR': 'Français',
};

// Provided in full. On change it writes both signals — the store profile + the
// `NEXT_LOCALE` cookie via `setLocaleAction` — then swaps the URL to the new
// locale, preserving the current pathname and query string via the typed
// `usePathname`/`useRouter` from `@/i18n/navigation`.
export const LocaleSwitcher = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const onChange = (next: string) => {
    const locale = next as Locale;
    const formData = new FormData();
    formData.set('locale', locale);
    startTransition(async () => {
      await setLocaleAction(null, formData);
      // `usePathname` is locale-agnostic (no prefix); `router.replace` with the
      // explicit `locale` re-prefixes the SAME path + query under the new locale.
      router.replace(
        // Preserve the query string the carry-in toolbar drives via nuqs.
        `${pathname}${typeof window === 'undefined' ? '' : window.location.search}`,
        { locale },
      );
    });
  };

  return (
    <Select onValueChange={onChange} disabled={isPending}>
      <SelectTrigger
        data-testid="locale-switcher"
        aria-label="Language"
        className="w-36"
      >
        <SelectValue placeholder="Language" />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LOCALES.map((locale) => (
          <SelectItem
            key={locale}
            value={locale}
            data-testid={`locale-option-${locale}`}
          >
            {LOCALE_LABELS[locale]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
