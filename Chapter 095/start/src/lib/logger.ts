import 'server-only';

import pino from 'pino';

// The structured logger. One process-wide instance; every seam derives a child
// (`logger.child({ seam: 'webhook.stripe' })`) so each line carries its origin.
// Pretty transport is dev-only; production emits newline-delimited JSON a collector
// can ingest.
//
// TODO(L4) — add the single scrubbing seam (reused in Pino + Sentry beforeSend) and the
// requestId mixin: the Pino instance below has no secret/PII scrubbing, so a secret named
// in a log payload (the webhook's `stripe-signature`) reaches the logs in the clear, and
// no requestId rides on each line, so a log entry can't be joined to its Sentry event.
// See findings/002-log-secret-leak.md and findings/003-missing-correlation-id.md.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: undefined,
});
