import * as Sentry from '@sentry/nextjs';

// The Next.js 16 instrumentation hook (092 L1). `register` runs once per runtime at
// boot and lazy-imports the matching Sentry config by NEXT_RUNTIME so the Node SDK
// never loads in the edge runtime and vice versa. The config (Sentry.init) lives in the
// sentry.*.config.ts files, NOT inline here — the canonical wiring shape.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// The load-bearing export: Next.js calls onRequestError for every uncaught throw in a
// server component, route handler, or server action (the framework-boundary errors that
// never reach a try/catch). Without it, GET /api/test/throw renders the default error
// page and no Sentry event is produced — the finding-1 broken state.
export const onRequestError = Sentry.captureRequestError;
