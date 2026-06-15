import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { Providers } from '@/app/_components/providers';
import { Toaster } from '@/components/ui/sonner';
import { routing } from '@/i18n/routing';

export const generateStaticParams = () =>
  routing.locales.map((locale) => ({ locale }));

// Scope the client payload to only the namespaces client components read —
// `invoices` (the table's labels/status), `nav`, and `locale-switcher` — never
// the full catalog (the marketing copy and metadata stay server-only).
const pick = <T extends Record<string, unknown>, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Pick<T, K> => {
  const out = {} as Pick<T, K>;
  for (const key of keys) {
    out[key] = source[key];
  }
  return out;
};

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

const LocaleLayout = async ({ children, params }: LocaleLayoutProps) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // `setRequestLocale` first, before any other next-intl call, so this segment
  // stays statically renderable. `<html lang>` is driven from the resolved URL
  // param (never the cookie) to avoid a hydration mismatch.
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>
          {/* NuqsAdapter is load-bearing: without it every nuqs client hook
              throws and the toolbar/pagination break. */}
          <NuqsAdapter>
            <NextIntlClientProvider
              messages={pick(messages, ['invoices', 'nav', 'locale-switcher'])}
            >
              {children}
            </NextIntlClientProvider>
            <Toaster />
          </NuqsAdapter>
        </Providers>
      </body>
    </html>
  );
};

export default LocaleLayout;
