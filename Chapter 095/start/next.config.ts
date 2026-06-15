import type { NextConfig } from 'next';

// TODO(L3) — wire Sentry here: the three Sentry config files + the instrumentation
// hook + wrap this exported config with the Sentry build helper + add the SENTRY_* env
// keys (see findings/001-sentry-not-wired.md for the seam shape).

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

// TODO(L6) — add the lucide-react barrel fix here under experimental (finding 6): list
// the icon package so the build rewrites the (protected) layout's barrel import to
// per-icon module paths. See findings/006-barrel-import.md.
const nextConfig: NextConfig = {
  cacheComponents: true,
  typedRoutes: true,
  reactCompiler: true,
  turbopack: { root: __dirname },
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

export default nextConfig;
