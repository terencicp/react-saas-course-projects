# Finding 003 — No request correlation id; a log line and its Sentry event can't be joined

**Category:** Structured logs — request-scoped correlation IDs (chapter 092, lesson 2).
**Severity:** medium — nothing leaks and nothing breaks; the cost is triage time. A 3am incident takes longer because the operator can't pivot from a Sentry event to the log lines for that exact request. Medium, not high: it degrades the incident response the other observability findings depend on, but it loses no data and exposes no secret.

## Rule

Every request carries a `requestId` that is minted once at the edge and threaded — over `AsyncLocalStorage`, never module-level state — into every log line and every Sentry event, so the two views of one request join on a single value (chapter 092, lesson 2 — `Structured logs: correlation IDs and AsyncLocalStorage`). The id is high-cardinality, so it rides as **context** on a Sentry event, never as a tag; the edge echoes it on the response header so a downstream service joins the same request.

## Location

The wiring is absent, so this is a "missing-piece" finding — name where each piece must live:

- `src/proxy.ts` — sets **no `x-request-id`**: it mints the CSP nonce (082 finding 4, pre-fixed) but no correlation id, and opens no request-scoped context.
- `src/lib/logger.ts` — has **no `requestId` mixin**, so log lines carry their seam (`webhook.stripe`) but nothing that joins them to a single request.
- `src/lib/request-context.ts` — **does not exist**. There is no `AsyncLocalStorage` store, so no `runWithContext`/`getRequestContext` for the mixin and Sentry's `beforeSend` to read.
- `src/app/api/webhooks/stripe/route.ts` — recovers no id (the proxy scope does not propagate into route handlers, so the handler must open its own scope).

How it surfaced — read the running app first. Trigger the throw target with the Sentry dashboard open, then look at the dev console for the same request:

```
curl -i http://localhost:3000/api/test/throw
```

The console log lines for that request and the Sentry event share **no common field** — there is no value to grep the logs by, so reconstructing "what else happened on this request" is manual and slow. The absent join key is the fingerprint.

## Consequence

When an error fires at 3am, the operator has a Sentry event (stack, release, breadcrumbs) on one screen and the structured logs on another, and no way to say "show me every log line for *this* request." Triage degrades to grepping the log stream by timestamp and guessing which lines belong together — exactly the manual correlation structured logging is supposed to eliminate. Across services it is worse: with no id echoed on the response, the request can't be followed past the edge. The cost is measured in minutes-to-resolution per incident, paid every incident — slower triage, not lost data.

## Fix

The installed seam — slice S3. Correlation lives in **`AsyncLocalStorage`**, not module-level state (which would bleed one request's id into the next under concurrency).

1. **`lib/request-context.ts`.** An `AsyncLocalStorage<RequestContext>` (`{ requestId; userId?; orgId? }`) exporting `runWithContext(context, fn)` and `getRequestContext()`. This is the single store every seam reads.

2. **`proxy.ts` mints + echoes.** Read `x-request-id` from the request or mint a fresh `uuidv7()`, thread it onto the request header (so route handlers recover it) **and** the response header (so a downstream service joins the same request), and open a `runWithContext` scope around the request work.

3. **The Pino mixin.** A `mixin: () => getRequestContext() ?? {}` in `lib/logger.ts` stamps the live `requestId` onto every line automatically — no call site remembers to pass it.

4. **The Sentry join.** Inside `beforeSend` (where the request scope is live — never at module scope, where there is no request at boot), read `getRequestContext()?.requestId` and attach it as **context**, not a tag:

   ```ts
   event.contexts = {
     ...event.contexts,
     request: { ...event.contexts?.request, requestId },
   };
   ```

   A tag would explode Sentry's low-cardinality tag index; context is the right home for a per-request value.

5. **Route handlers open their own scope.** The proxy scope does not propagate into a route handler, so the Stripe webhook recovers `x-request-id` from the header (or mints its own) and wraps its body in `runWithContext`. Forgetting this is the named trap — the handler's lines would carry no id while the proxy's do.
