import type { Metadata } from 'next';
import NextLink from 'next/link';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LocaleSwitcher } from '@/app/[locale]/(app)/invoices/locale-switcher';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

// The authed surface is noindex and declares no `alternates` — the discipline of
// declaring metadata everywhere, even where the SEO surface is intentionally dark.
export const generateMetadata = (): Metadata => ({
  robots: { index: false },
});

type AppLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

const AppLayout = async ({ children, params }: AppLayoutProps) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Re-enable static rendering for this segment before any next-intl call.
  setRequestLocale(locale);
  const t = await getTranslations('nav');

  return (
    <>
      <header className="border-b">
        <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 text-sm">
          <span className="font-semibold">{t('brand')}</span>
          <Link
            className="text-muted-foreground hover:text-foreground"
            href="/invoices"
          >
            {t('list')}
          </Link>
          {/* The inspector is locale-agnostic (lives outside `[locale]/`), so it
              uses a plain Next link — never the locale-prefixing one. */}
          <NextLink
            className="text-muted-foreground hover:text-foreground"
            href="/inspector"
          >
            {t('inspector')}
          </NextLink>
          <div className="ms-auto">
            <LocaleSwitcher />
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
};

export default AppLayout;
