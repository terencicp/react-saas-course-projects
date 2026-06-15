import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { Providers } from '@/app/_components/providers';
import { Toaster } from '@/components/ui/sonner';
import { routing } from '@/i18n/routing';

// TODO(L2) — drive <html lang={locale}> from the resolved param (not a hardcoded
// en-US), and scope the NextIntlClientProvider via pick() to only the client
// namespaces (nav, locale-switcher, invoices) instead of the whole catalog.
//
// Starter shell: `setRequestLocale`/`generateStaticParams` are wired so the
// carry-in static children (the marketing pages and the [id]/edit route both
// ship complete with their own `generateStaticParams` + `setRequestLocale`)
// prerender. But `<html lang>` is still hardcoded `en-US` and the provider is
// unscoped, so the locale prefix routes without yet changing the rendered
// language — the honest "routes-but-doesn't-localize" before-state.
export const generateStaticParams = () =>
  routing.locales.map((locale) => ({ locale }));

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
  // stays statically renderable.
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang="en-US" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>
          {/* NuqsAdapter is load-bearing: without it every nuqs client hook
              throws and the toolbar/pagination break. */}
          <NuqsAdapter>
            <NextIntlClientProvider messages={messages}>
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
