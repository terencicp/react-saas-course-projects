import { ImageResponse } from 'next/og';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';

// Provided in full: a per-locale Open Graph image. S3 references it through the
// marketing metadata; the image itself reads the locale's `marketing.meta.home`
// title so `/fr-FR/`'s OG renders French text.
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Invoices';

export const generateStaticParams = () =>
  routing.locales.map((locale) => ({ locale }));

type OgImageProps = {
  params: Promise<{ locale: string }>;
};

const OpengraphImage = async ({ params }: OgImageProps) => {
  const { locale } = await params;
  const resolved = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const t = await getTranslations({
    locale: resolved,
    namespace: 'marketing.meta',
  });

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: 80,
        background: '#0a0a0a',
        color: '#fafafa',
        fontSize: 64,
        fontWeight: 600,
        lineHeight: 1.1,
      }}
    >
      {t('home.title')}
    </div>,
    size,
  );
};

export default OpengraphImage;
