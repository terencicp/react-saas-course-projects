import * as Sentry from '@sentry/nextjs';

// The edge-runtime Sentry client. Loaded by instrumentation.ts's `register` when
// NEXT_RUNTIME === 'edge' (the proxy and any edge route handlers). Same DSN and release
// as the server config so events from both runtimes group under one deploy (092 L1).
const release = process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  release,
  tracesSampleRate: 1.0,
});
