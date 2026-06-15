import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';

import { SESSION_COOKIE_PREFIX } from '@/lib/auth';

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

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/sign-in', '/sign-up'],
};
