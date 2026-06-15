import * as Sentry from '@sentry/nextjs';

// The client-runtime Sentry SDK (browser). Next.js 16 loads this file automatically on
// the client. One DSN covers client and server — a separate "client" DSN is the trap
// the 092 lesson names (extra config to maintain). NEXT_PUBLIC_SENTRY_DSN is the
// client-readable copy of the same DSN; the release tag matches the server config so
// events from both sides on one deploy group together (092 L1).
const release = process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  release,
  tracesSampleRate: 1.0,
});

// Required by Next.js 16 to instrument client-side router navigations as Sentry spans.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
