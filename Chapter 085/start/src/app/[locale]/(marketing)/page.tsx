import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

// TODO(L4) — generateMetadata with getTranslations + generateAlternates + per-locale OG

type MarketingHomeProps = {
  params: Promise<{ locale: string }>;
};

const MarketingHome = async ({ params }: MarketingHomeProps) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations('marketing.home');

  return (
    <div data-testid="marketing-home" className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('heading')}</h1>
      <p className="text-lg text-muted-foreground">{t('subheading')}</p>
      <Link
        className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        href="/invoices"
      >
        {t('cta')}
      </Link>
    </div>
  );
};

export default MarketingHome;
