# Finding 001 — Sentry is not wired; uncaught errors vanish

**Category:** Error monitoring — Sentry init + source maps + release (chapter 092, lesson 1).
**Severity:** critical — production throws produce no operator-visible signal at all, so an incident is invisible until a user reports it. The deliberate-throw proof confirms the gap end-to-end. Critical, not high, because this is lost data, not slow data — observability gaps close before launch.

## Rule

Sentry is initialized across the three runtimes — client, server, edge — with source-map upload and a release tag so an uncaught throw arrives grouped, with a readable stack trace, breadcrumbs, and the deploy it shipped in (chapter 092, lesson 1 — `Sentry: capture, releases, breadcrumbs`). The load-bearing pieces: `instrumentation.ts` exports `register` (lazy-importing the matching `sentry.*.config.ts` by `NEXT_RUNTIME`) and `onRequestError = Sentry.captureRequestError` (the Next.js 16 hook for framework-boundary throws); `next.config.ts` is wrapped in `withSentryConfig`; the release is the deploy commit SHA so a regression maps to the version that introduced it.

## Location

The wiring is absent, so this is a "missing-piece" finding — name where each piece must live:

- `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` — the three `Sentry.init` calls (one per runtime). None exist.
- `instrumentation.ts` — must export `register` + `onRequestError`. Absent, so framework-boundary throws never reach Sentry.
- `next.config.ts` — must be wrapped in `withSentryConfig` for the build-time instrumentation + source-map upload. Ships unwrapped.
- `src/env.ts` — the `SENTRY_*` build keys are absent.

How it surfaced — the running app names it before source. Hit the provided proof target with the Sentry project dashboard open in another tab:

```
curl -i http://localhost:3000/api/test/throw
```

The route throws `Error('Sentry smoke test')`; the framework renders the default Next error page and **no event lands in Sentry**. The empty dashboard after a deliberate throw is the fingerprint — the gap is observable end-to-end, not inferred from reading config. Confirm in source with a grep that the wiring files do not exist:

```
rg --files | rg "instrumentation|sentry\." 
```

No match for `instrumentation.ts` or any `sentry.*.config.ts`, and `rg "withSentryConfig" next.config.ts` is empty.

## Consequence

A server action or route handler throws in production and the operator sees nothing — the function output goes to the platform's log tab, the stack trace is minified to `Function.t [as h] (chunk-abc123.js:1:42)`, and there is no grouping, no release tag, no user/org context. Finding "this error hit user X at 14:32 on the Pro billing flow" means grepping a log tab by hand at 3am. Errors either vanish into the framework boundary (no `onRequestError`) or, if they reach a catch, arrive as minified noise no one can act on. This is lost observability data on the most operator-critical surface — the difference between an incident triaged in minutes and one discovered from a support ticket days later.

## Fix

The installed seam — wired in slice S2, the difference between `start/` and `solution/`:

1. **`Sentry.init` per runtime.** Create `instrumentation-client.ts` (browser SDK), `sentry.server.config.ts` (Node), and `sentry.edge.config.ts` (edge), each calling `Sentry.init({ dsn, release, tracesSampleRate })`. One DSN covers client and server — a separate "client" DSN is the named trap (extra config to maintain). `tracesSampleRate: 1.0` locally; production drops to 0.1–0.2 because traces cost more than error events.

2. **The framework hook.** In `instrumentation.ts`, export `register` (lazy-import the server/edge config by `NEXT_RUNTIME` so the Node SDK never loads on the edge) and `export const onRequestError = Sentry.captureRequestError`. Forgetting `onRequestError` is the most common omission — framework-boundary throws then never reach Sentry.

3. **`withSentryConfig` + source maps + release.** Wrap `next.config.ts`:

   ```ts
   export default withSentryConfig(nextConfig, {
     silent: true,
     org: process.env.SENTRY_ORG,
     project: process.env.SENTRY_PROJECT,
     widenClientFileUpload: true,
   });
   ```

   Source-map upload is gated on `SENTRY_AUTH_TOKEN` at **build** time (local dev skips it — no value, slow build); the upload rebinds the minified trace to original source. The release is computed from `VERCEL_GIT_COMMIT_SHA` (with a static dev fallback), never hardcoded. Only these four keys — `hideSourceMaps` was removed in `@sentry/nextjs` v9+ (hidden maps are the default) and `disableLogger` is deprecated/inert under Turbopack.

Two traps the answer key scores: a missing `SENTRY_AUTH_TOKEN` ships the release tag but a minified stack ("line 1 column 12345") no one can read; a hardcoded release (`'v1.0.0'`) ties a week of unrelated errors to one version, so regressions stop mapping to the deploy that caused them. The `beforeSend` redactor that strips secrets from events is the next seam — finding 002 — reusing the one `redact` from `lib/logger.ts`.
