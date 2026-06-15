import type { MetadataRoute } from 'next';
import { APP_URL } from '@/lib/seo/alternates';

// Allow all crawling; the authed app routes carry their own `noindex` via each
// route's metadata (S4), so they stay out of the index without a disallow rule.
const robots = (): MetadataRoute.Robots => ({
  rules: { userAgent: '*', allow: '/' },
  sitemap: `${APP_URL}/sitemap.xml`,
});

export default robots;
