import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LocaleSwitcher } from '@/app/[locale]/(app)/invoices/locale-switcher';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

type MarketingLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

const MarketingLayout = async ({ children, params }: MarketingLayoutProps) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    // Marketing metadata/components run before any next-intl call; narrow first.
    return null;
  }
  setRequestLocale(locale);
  const t = await getTranslations('nav');

  return (
    <>
      <header className="border-b">
        <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 text-sm">
          <Link className="font-semibold" href="/">
            {t('brand')}
          </Link>
          <Link
            className="text-muted-foreground hover:text-foreground"
            href="/pricing"
          >
            {t('pricing')}
          </Link>
          <Link
            className="text-muted-foreground hover:text-foreground"
            href="/features"
          >
            {t('features')}
          </Link>
          <Link
            className="text-muted-foreground hover:text-foreground"
            href="/invoices"
          >
            {t('app')}
          </Link>
          <div className="ms-auto">
            <LocaleSwitcher />
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-12">{children}</main>
    </>
  );
};

export default MarketingLayout;
