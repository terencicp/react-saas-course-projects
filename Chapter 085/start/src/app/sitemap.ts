import type { MetadataRoute } from 'next';

// TODO(L4) — one entry per canonical path with alternates.languages
//
// One entry per canonical marketing path (`/`, `/pricing`, `/features`). Each
// should carry `alternates.languages` mapped over `routing.locales` via
// `getPathname`, so Next emits an `<xhtml:link>` per locale. Root-level, not
// under `[locale]/`; absolute URLs (prepend `APP_URL`).
const sitemap = (): MetadataRoute.Sitemap => [];

export default sitemap;
