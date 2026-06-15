import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
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

  // TODO(L2) — route the nav strings ("Invoices"/"Pricing"/"Features"/"App")
  // through `getTranslations('nav')` (`t('brand')`/`t('pricing')`/`t('features')`/
  // `t('app')`); the keys already exist in the catalogs. No hard-coded JSX
  // strings under [locale]/.
  return (
    <>
      <header className="border-b">
        <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 text-sm">
          <Link className="font-semibold" href="/">
            Invoices
          </Link>
          <Link
            className="text-muted-foreground hover:text-foreground"
            href="/pricing"
          >
            Pricing
          </Link>
          <Link
            className="text-muted-foreground hover:text-foreground"
            href="/features"
          >
            Features
          </Link>
          <Link
            className="text-muted-foreground hover:text-foreground"
            href="/invoices"
          >
            App
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
