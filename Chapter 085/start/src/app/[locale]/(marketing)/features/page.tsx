import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

// TODO(L4) — generateMetadata with getTranslations + generateAlternates + per-locale OG

type FeaturesPageProps = {
  params: Promise<{ locale: string }>;
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
