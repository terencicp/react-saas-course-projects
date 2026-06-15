# Finding 002 — The webhook logs the `stripe-signature` header in the clear

**Category:** Structured logs — the 3am rule, secret/PII exclusion (chapter 092, lesson 3).
**Severity:** high — a live signing secret lands in plaintext logs, so anyone with log access can forge a webhook delivery. High, not critical: the logs are first-party (not user-facing) and the leak is contained until they are exfiltrated or shipped to a third-party drain — but it is operator-visible secret exposure that must close before launch.

## Rule

Secrets and PII never reach the logs — the 3am rule: a log line you would not paste into a public incident channel at 3am does not ship (chapter 092, lesson 3 — `Structured logs: levels, redaction, the 3am rule`). The structured logger carries a single `redact` seam configured with the canonical drop-list (`authorization`, `cookie`, `stripe-signature`, `password`, `token`, `apiKey`, the wildcard `*_KEY`/`*_SECRET`) plus a `PII_KEYS` set, so a secret named anywhere in a payload is scrubbed to `[REDACTED]` before serialization — at exactly one place.

## Location

- `src/lib/logger.ts` — the Pino instance ships with **no `redact` slot** (no drop-list, no `PII_KEYS`), so nothing is scrubbed on the way out.
- `src/app/api/webhooks/stripe/route.ts` — the ingress serializes the full header set before verification:

  ```ts
  log.info({ headers: Object.fromEntries(request.headers) }, 'request_received');
  ```

  `Object.fromEntries(request.headers)` includes `stripe-signature` (the HMAC over the raw body keyed on the endpoint secret) and the `cookie`/`authorization` headers verbatim.

How it surfaced — replay a delivery and watch the dev console:

```
stripe trigger payment_intent.succeeded   # or: stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

The `request_received` line prints `"stripe-signature":"t=...,v1=<hex>"` in plaintext. The fingerprint is the signing material sitting in the log stream where a `[REDACTED]` token belongs.

## Consequence

The webhook's signing secret is the one thing that proves a delivery actually came from Stripe. Once `stripe-signature` (and the rotating values it is computed against) is in the logs, the logs become a secret store: anyone who reads them — a support engineer, a leaked log export, a third-party log drain (chapter 098) — can replay or forge a delivery that passes `constructEvent`. This is the exact 3am-rule violation the discipline exists to stop: a line no one should be able to paste into a public channel, shipped on every webhook hit. It is lost containment of a secret, not a slow query — observability hygiene that closes before launch.

## Fix

The installed seam — slice S3, the difference between `start/` and `solution/`. **One redactor, two callers**: a single `redact` function in `lib/logger.ts` is the only place the team configures the rule.

1. **Declare the seam in `lib/logger.ts`.** A `redact(payload)` that deep-walks any object/array and replaces every value under a dropped key with `[REDACTED]`, driven by the canonical drop-list + `PII_KEYS`. The wildcard `*_KEY`/`*_SECRET` patterns (matched case-insensitively on the key suffix) catch the next secret a developer adds without touching the seam — `STRIPE_SECRET_KEY`, `INVITATION_SIGNING_SECRET`, and any future `*_KEY` are scrubbed by pattern, not by an exhaustive list.

2. **Caller one — Pino.** Wire `redact` into the logger's `formatters.log` so every log object passes through it on the way out. The webhook seam also stops serializing the raw header set — it logs only the intentional fields — so the two layers reinforce each other: the call site never dumps headers, and the seam catches anything a future field accidentally carries (`stripe-signature` serializes as `[REDACTED]` either way). No call site has to remember to scrub.

3. **Caller two — Sentry's `beforeSend`.** The same `redact` runs over every Sentry event in `sentry.server.config.ts`, so a secret captured in event context is scrubbed before it leaves the process — the redactor reaches both sinks from one definition (finding 003 adds the requestId join in that same `beforeSend`).

The named trap: scrubbing at each call site instead of one seam. The fifth developer forgets, and the secret ships from the one line nobody redacted. The seam — not the call site — is the place the rule lives.
