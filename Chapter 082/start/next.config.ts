import type { NextConfig } from 'next';

// The static security headers, applied to every route.
//
// SEEDED AUDIT DEFECT #4 (finding 4) — CSP header omission (081 L1): this ships the
// five static headers below (HSTS, X-Content-Type-Options, X-Frame-Options,
// Referrer-Policy, Permissions-Policy) but NO content-security policy header, and
// proxy.ts generates no per-request nonce. The fingerprint is "CSP absent" (not "no
// headers at all"): `curl -I http://localhost:3000/` returns HSTS but no CSP header.
// With no CSP there is no defense-in-depth behind the finding-2 XSS sink. The healthy
// shape adds a static CSP base + a per-request nonce in proxy.ts + 'strict-dynamic'.
// The target ships the bug on purpose; do not "fix" it here. (Finding 4 names the CSP
// header by its full name and the curl evidence.)
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

const nextConfig: NextConfig = {
  cacheComponents: true,
  typedRoutes: true,
  reactCompiler: true,
  turbopack: { root: __dirname },
  headers: async () => [
    {
      source: '/:path*',
      headers: staticSecurityHeaders,
    },
  ],
};

export default nextConfig;
