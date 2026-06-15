import 'server-only';

import pino from 'pino';

import { getRequestContext } from '@/lib/request-context';

// The structured logger. One process-wide instance; every seam derives a child
// (`logger.child({ seam: 'webhook.stripe' })`) so each line carries its origin.
//
// Two seams live here (findings 2 and 3, slice S3):
//   - `redact` is the SINGLE scrubbing seam — "one redactor, two callers": Pino runs
//     it over every log object (via `formatters.log`) and Sentry's `beforeSend`
//     (sentry.server.config.ts) runs the same function over each event. A secret named
//     in the drop-list never reaches either sink.
//   - the `mixin` reads the request-scoped context over AsyncLocalStorage so every line
//     carries the `requestId` that joins it to its Sentry event.

// The exact-match secret/PII keys (092 L3 — the 3am rule). Compared case-insensitively.
const DROP_KEYS = new Set([
  'authorization',
  'cookie',
  'stripe-signature',
  'password',
  'token',
  'apikey',
]);

// High-cardinality PII fields scrubbed from every payload alongside the secrets.
const PII_KEYS = new Set(['email', 'phone', 'ip', 'ssn']);

const REDACTED = '[REDACTED]';

// A key is dropped if it is an exact secret/PII match or ends in `_key`/`_secret`
// (the wildcard `*_KEY`/`*_SECRET` patterns) — case-insensitive.
const shouldDrop = (key: string): boolean => {
  const lower = key.toLowerCase();
  return (
    DROP_KEYS.has(lower) ||
    PII_KEYS.has(lower) ||
    lower.endsWith('_key') ||
    lower.endsWith('_secret')
  );
};

// The single redaction seam. Deep-walks a payload and replaces every value under a
// dropped key with `[REDACTED]`, preserving structure so the surrounding line stays
// readable. Reused verbatim by Pino's `formatters.log` and Sentry's `beforeSend`.
export const redact = <T>(payload: T): T => {
  if (Array.isArray(payload)) {
    return payload.map((item) => redact(item)) as T;
  }
  if (payload !== null && typeof payload === 'object') {
    const entries = Object.entries(payload as Record<string, unknown>).map(
      ([key, value]) =>
        shouldDrop(key) ? [key, REDACTED] : [key, redact(value)],
    );
    return Object.fromEntries(entries) as T;
  }
  return payload;
};

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: undefined,
  formatters: {
    log: (object) => redact(object),
  },
  mixin: () => getRequestContext() ?? {},
});
