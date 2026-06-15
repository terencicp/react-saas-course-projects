import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';

import { SESSION_COOKIE_PREFIX } from '@/lib/auth';

// The proxy (Next.js 16's renamed middleware). Two responsibilities here:
//   1. Cookie-presence redirects for the protected/auth surfaces (presence-only; no
//      authz decision lives here).
//   2. The per-request CSP nonce + Content-Security-Policy header (082 finding 4,
//      pre-fixed): a fresh nonce per request, threaded to Server Components through
//      the `x-nonce` request header, with `'strict-dynamic'` so a nonce-trusted
//      script can load its own dependencies without enumerating every host.
//
// TODO(L4) — mint/echo the request-correlation id header and open a runWithContext
// scope: read the request-id header from the request or mint a fresh uuidv7(), echo it
// on the request + response headers, and wrap the handler in runWithContext so every log
// line the proxy emits carries the id (lib/request-context.ts). The proxy scope does NOT
// propagate into route handlers — each recovers the id from the header and opens its own
// scope. See findings/003-missing-correlation-id.md.
export async function proxy(request: NextRequest) {
  // cookiePrefix is mandatory — the better-auth default silently misses the
  // __Host- cookie. This is presence-only; no authz decision lives here.
  const cookie = getSessionCookie(request, {
    cookiePrefix: SESSION_COOKIE_PREFIX,
  });
  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith('/dashboard');
  const isAuthPage = path === '/sign-in' || path === '/sign-up';

  if (isProtected && !cookie) {
    const next = encodeURIComponent(path + request.nextUrl.search);
    return NextResponse.redirect(new URL(`/sign-in?next=${next}`, request.url));
  }

  if (isAuthPage && cookie) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // The CSP: a fresh nonce per request, the static base, and 'strict-dynamic'.
  // In dev only, allow 'unsafe-eval' — Next.js 16 + Turbopack's RSC client runtime
  // uses eval() during hydration, which 'strict-dynamic' alone blocks. Production
  // ships the strict policy unchanged.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const devEval =
    process.env.NODE_ENV === 'development' ? ` 'unsafe-eval'` : '';
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' https://fonts.gstatic.com`,
    `object-src 'none'`,
    `base-uri 'self'`,
  ].join('; ');

  // Thread the nonce to Server Components via the request header.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/sign-in', '/sign-up'],
};
