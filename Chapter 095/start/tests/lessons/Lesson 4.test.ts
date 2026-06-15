import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 4 — Findings 002 & 003: the production logger seam.
//
// The seam lives behind `import 'server-only'` (logger.ts, request-context.ts), which
// throws the moment it is imported into this node test env — so we can't import and call
// `redact` directly. The gate is therefore a SOURCE-SHAPE check: read each file the
// student edits and prove it carries the structure that produces the observable behavior
// (a scrubbed secret, a request-scoped id, a header that carries the id across the proxy
// boundary). Never importing the seam keeps the runner in node-env, no-DOM.
//
// readSource bases on the project root (one level up from tests/lessons/), then joins the
// file's repo path. A file: URL base is mandatory — a bare path is not a valid `new URL()`
// base and would throw "Invalid URL"; a file: URL is, and handles spaces in the path.
const readSource = (rel: string) =>
  readFileSync(new URL(rel, new URL('../../', import.meta.url)), 'utf8');

// Strip comments before matching: the start stubs carry TODO(L4) comments that name the
// very tokens we look for ("x-request-id", "runWithContext", "redact"), which would
// falsely satisfy a naive regex. We match real source, not the prose telling the student
// what to write.
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments (leave http:// alone)

const readCode = (rel: string) => {
  let raw: string;
  try {
    raw = readSource(rel);
  } catch {
    throw new Error(
      `Could not read ${rel}. Create or edit that file as the lesson asks before this gate can pass.`,
    );
  }
  return stripComments(raw);
};

// The start stubs still carry their TODO(L4) marker; once the student does the work the
// marker is gone. While it is present the seam is unwritten, so report that plainly
// instead of leaking a confusing regex miss.
const stillStub = (code: string) => /TODO\(L4\)/.test(code);

// Requirement 1 + 2: a single redaction routine carries the canonical drop-list and
// scrubs both an exact drop-list key (stripe-signature) and a *_secret suffix key, while
// preserving the surrounding structure — and it is the only redaction logic, exported
// once for both Pino and Sentry to reuse.
describe('Req 1/2 — one redaction seam carrying the canonical drop-list', () => {
  const logger = () => readCode('src/lib/logger.ts');

  it('exports a single redaction routine reused by both sinks', () => {
    const code = logger();
    expect(
      stillStub(code),
      'src/lib/logger.ts still holds the TODO(L4) stub — add the redaction seam before this gate can pass.',
    ).toBe(false);
    expect(
      /export\s+const\s+redact\b/.test(code),
      'src/lib/logger.ts must export a single `redact` routine — the one redactor both Pino and Sentry call. Declaring it once is the discipline; duplicating it is how a drop-list edit lands in one sink and not the other.',
    ).toBe(true);
  });

  it('carries the canonical secret/PII drop-list', () => {
    const code = logger().toLowerCase();
    for (const key of [
      'authorization',
      'cookie',
      'stripe-signature',
      'password',
      'token',
      'apikey',
      'email',
      'phone',
      'ssn',
    ]) {
      expect(
        code.includes(`'${key}'`) || code.includes(`"${key}"`),
        `The drop-list is missing '${key}'. The redactor's drop-list must name every canonical secret/PII key (the 3am rule) so none serializes.`,
      ).toBe(true);
    }
  });

  it('matches the *_key / *_secret suffix patterns', () => {
    const code = logger();
    expect(
      /_key['"]\s*\)|endsWith\(\s*['"]_key['"]/.test(code) || /_key/.test(code),
      'The redactor must drop any key ending in `_key` (e.g. stripe_api_key) — a suffix match, not just the exact list.',
    ).toBe(true);
    expect(
      /endsWith\(\s*['"]_secret['"]/.test(code) || /_secret/.test(code),
      'The redactor must drop any key ending in `_secret` (e.g. webhook_secret) — a suffix match, so a future secret-shaped field is caught even if it is not on the exact list.',
    ).toBe(true);
  });

  it('replaces dropped values with a redaction marker rather than deleting them (preserves structure)', () => {
    const code = logger();
    expect(
      /\[REDACTED\]/.test(code),
      'A dropped value must be replaced with a `[REDACTED]` marker, not deleted — preserving the surrounding structure keeps the log line readable while the secret never serializes.',
    ).toBe(true);
  });

  it('matches drop keys case-insensitively', () => {
    const code = logger();
    expect(
      /toLowerCase\(\)/.test(code),
      'Drop keys must be matched case-insensitively (e.g. via toLowerCase) — `Stripe-Signature` and `stripe-signature` are the same secret.',
    ).toBe(true);
  });

  it('runs the same redactor over Sentry events in beforeSend (one redactor, two callers)', () => {
    const code = readCode('sentry.server.config.ts');
    expect(
      /redact\s*\(/.test(code),
      "sentry.server.config.ts's beforeSend must call the same `redact` seam from lib/logger.ts — duplicating the scrub logic is how a secret slips one sink. Import and reuse the one redactor.",
    ).toBe(true);
  });
});

// Requirement 4: each request opens its own correlation scope. The proxy reads-or-mints
// `x-request-id` and echoes it on the response; the context lives over AsyncLocalStorage
// (not module-level state, which bleeds one request's id into another under concurrency);
// and the webhook handler recovers the id and opens its own scope (the proxy scope does
// not propagate into route handlers in Next.js 16).
describe('Req 4 — a per-request correlation scope joined on x-request-id', () => {
  it('keeps the correlation context in AsyncLocalStorage, not module-level state', () => {
    const code = readCode('src/lib/request-context.ts');
    expect(
      /AsyncLocalStorage/.test(code),
      'src/lib/request-context.ts must hold the context in an AsyncLocalStorage — module-level or globalThis state is shared across concurrent requests and would bleed one request id into another’s logs.',
    ).toBe(true);
    expect(
      /export\s+const\s+runWithContext\b/.test(code) &&
        /export\s+const\s+getRequestContext\b/.test(code),
      'request-context.ts must export both `runWithContext` (open a scope) and `getRequestContext` (read it) — the proxy and each handler open a scope, the logger mixin reads it.',
    ).toBe(true);
  });

  it('mints/recovers x-request-id in the proxy and echoes it on the response', () => {
    const code = readCode('src/proxy.ts');
    expect(
      stillStub(code),
      'src/proxy.ts still holds the TODO(L4) stub — wire the correlation id before this gate can pass.',
    ).toBe(false);
    expect(
      /x-request-id/i.test(code),
      'src/proxy.ts must read-or-mint the `x-request-id` header — it is the cross-boundary carrier that lets the route handler recover the same id.',
    ).toBe(true);
    expect(
      /headers\.set\(\s*['"]x-request-id['"]/i.test(code),
      'src/proxy.ts must echo `x-request-id` on the response header so downstream services join on the same request id.',
    ).toBe(true);
    expect(
      /runWithContext\s*\(/.test(code),
      'src/proxy.ts must wrap the handler in `runWithContext` so any log line the proxy emits carries the request id.',
    ).toBe(true);
  });

  it('makes the webhook handler recover the id and open its own scope', () => {
    const code = readCode('src/app/api/webhooks/stripe/route.ts');
    expect(
      stillStub(code),
      'src/app/api/webhooks/stripe/route.ts still holds the TODO(L4) stub — recover the request id and open a scope before this gate can pass.',
    ).toBe(false);
    expect(
      /x-request-id/i.test(code),
      'The webhook handler must recover `x-request-id` from the request — the proxy’s ALS scope does NOT propagate into Next.js route handlers, so the header is the only carrier across the boundary.',
    ).toBe(true);
    expect(
      /runWithContext\s*\(/.test(code),
      'The webhook handler must open its own `runWithContext` scope (the proxy scope does not reach it), so every log line it emits carries the requestId mixin.',
    ).toBe(true);
    expect(
      /Object\.fromEntries\(\s*request\.headers\s*\)/.test(code),
      'The seeded leak — logging `{ headers: Object.fromEntries(request.headers) }` — must be gone; it serializes `stripe-signature` in the clear. Log only intentional fields.',
    ).toBe(false);
  });
});
