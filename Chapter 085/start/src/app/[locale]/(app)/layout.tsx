import NextLink from 'next/link';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LocaleSwitcher } from '@/app/[locale]/(app)/invoices/locale-switcher';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

// TODO(L4) — generateMetadata robots noindex, no alternates

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

  // TODO(L2) — route the nav strings ("Invoices"/"List"/"Inspector") through
  // `getTranslations('nav')` (`t('brand')`/`t('list')`/`t('inspector')`); the
  // keys already exist in the catalogs. No hard-coded JSX strings under [locale]/.
  return (
    <>
      <header className="border-b">
        <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 text-sm">
          <span className="font-semibold">Invoices</span>
          <Link
            className="text-muted-foreground hover:text-foreground"
            href="/invoices"
          >
            List
          </Link>
          {/* The inspector is locale-agnostic (lives outside `[locale]/`), so it
              uses a plain Next link — never the locale-prefixing one. */}
          <NextLink
            className="text-muted-foreground hover:text-foreground"
            href="/inspector"
          >
            Inspector
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
