import 'server-only';

import pino from 'pino';

// The structured logger. One process-wide instance; every seam derives a child
// (`logger.child({ seam: 'webhook.stripe' })`) so each line carries its origin.
// The webhook calls this on every disposition — never logging the raw body before
// the signature is verified (a log-injection vector). Pretty transport is dev-only;
// production emits newline-delimited JSON a collector can ingest.
//
// The student only *calls* this logger in the project; no redaction config to write
// (that hardening is a forward reference). Level is INFO unless LOG_LEVEL overrides.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: undefined,
});
