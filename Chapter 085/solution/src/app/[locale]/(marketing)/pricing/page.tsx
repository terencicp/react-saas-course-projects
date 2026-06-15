import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { generateAlternates } from '@/lib/seo/alternates';
import { bcp47ToOgLocale } from '@/lib/seo/og-locale';

type PricingPageProps = {
  params: Promise<{ locale: string }>;
};

export const generateMetadata = async ({
  params,
}: PricingPageProps): Promise<Metadata> => {
  const { locale } = await params;
  const resolved = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const t = await getTranslations({
    locale: resolved,
    namespace: 'marketing.meta',
  });

  return {
    title: t('pricing.title'),
    description: t('pricing.description'),
    alternates: generateAlternates('/pricing', resolved),
    openGraph: {
      title: t('pricing.title'),
      description: t('pricing.description'),
      locale: bcp47ToOgLocale(resolved),
      alternateLocale: routing.locales
        .filter((other) => other !== resolved)
        .map(bcp47ToOgLocale),
    },
  };
};

const PricingPage = async ({ params }: PricingPageProps) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations('marketing.pricing');

  return (
    <div data-testid="marketing-pricing" className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('heading')}</h1>
    </div>
  );
};

export default PricingPage;
