import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { generateAlternates } from '@/lib/seo/alternates';
import { bcp47ToOgLocale } from '@/lib/seo/og-locale';

type FeaturesPageProps = {
  params: Promise<{ locale: string }>;
};

export const generateMetadata = async ({
  params,
}: FeaturesPageProps): Promise<Metadata> => {
  const { locale } = await params;
  const resolved = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const t = await getTranslations({
    locale: resolved,
    namespace: 'marketing.meta',
  });

  return {
    title: t('features.title'),
    description: t('features.description'),
    alternates: generateAlternates('/features', resolved),
    openGraph: {
      title: t('features.title'),
      description: t('features.description'),
      locale: bcp47ToOgLocale(resolved),
      alternateLocale: routing.locales
        .filter((other) => other !== resolved)
        .map(bcp47ToOgLocale),
    },
  };
};

const FeaturesPage = async ({ params }: FeaturesPageProps) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations('marketing.features');

  return (
    <div data-testid="marketing-features" className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('heading')}</h1>
    </div>
  );
};

export default FeaturesPage;
