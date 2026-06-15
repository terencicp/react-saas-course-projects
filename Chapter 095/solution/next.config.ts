import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

// The static security headers, applied to every route (082 finding 4, pre-fixed):
// the five static headers below (HSTS, X-Content-Type-Options, X-Frame-Options,
// Referrer-Policy, Permissions-Policy) ship here, and the per-request CSP nonce +
// Content-Security-Policy header live in src/proxy.ts (the policy is request-time
// because the nonce is). Together they are the XSS backstop the 082 audit required.
const staticSecurityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

// Finding 6 (L6, slice S5) — the barrel fix: `optimizePackageImports` rewrites the
// (protected) layout's `lucide-react` barrel import to per-icon module paths at build,
// so only the icons the nav references reach the bundle instead of the whole set. This
// is the single in-place performance fix; the waterfall (5), the N+1 (8), and the LCP
// image (7) are documented, not patched.
const nextConfig: NextConfig = {
  cacheComponents: true,
  typedRoutes: true,
  reactCompiler: true,
  turbopack: { root: __dirname },
  experimental: { optimizePackageImports: ['lucide-react'] },
  // The PostHog reverse proxy (093): /ingest forwards to the PostHog edge so the
  // client never calls the third-party host directly. skipTrailingSlashRedirect
  // keeps the ingest path from a 308 that would drop the body.
  skipTrailingSlashRedirect: true,
  rewrites: async () => [
    {
      source: '/ingest/static/:path*',
      destination: 'https://eu-assets.i.posthog.com/static/:path*',
    },
    {
      source: '/ingest/:path*',
      destination: 'https://eu.i.posthog.com/:path*',
    },
  ],
  headers: async () => [
    {
      source: '/:path*',
      headers: staticSecurityHeaders,
    },
  ],
};

// Sentry build-time wiring (finding 1, slice S2): withSentryConfig injects the
// instrumentation and gates the source-map upload on SENTRY_AUTH_TOKEN at build. Only
// these four keys — `hideSourceMaps` was removed in @sentry/nextjs v9+ (hidden source
// maps are the default) and `disableLogger` is deprecated/inert under Turbopack.
// `widenClientFileUpload` uploads more client chunks so the browser stack traces decode
// too. `org`/`project` slugs live in process.env, outside the env schema.
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  widenClientFileUpload: true,
});
