# Chapter 075 — Upstash rate limits on the auth surface

Layer three `@upstash/ratelimit` limiters onto the carried-in email + password auth
surface at the **Server Action seam**: sign-in (per-IP + per-email), sign-up (per-IP),
and password reset (per-IP + per-email). Better Auth's built-in limiter goes off, so
the application-level limiters are the single enforcement point. A provided
`/inspector` route drives every observation — the live remaining-token panel, the
recent-responses log, the structured-log tail, and the failure-mode toggles.

The budget rides the action `Result` (a Server Action cannot set HTTP headers —
`headers()` is read-only); literal `RateLimit-*` headers exist only on the
route-handler twin at `/api/limit-demo`, present for parity. The catch-all
`/api/auth/[...all]` stays unwrapped — limits land at the action seam.

## Prerequisites

- Node 24, pnpm 11.3 (`engine-strict` is on; the `preinstall` guard blocks non-pnpm).
- Docker (for local Postgres 18).
- A [Resend](https://resend.com) account with a **verified sending domain** (the
  reset email rides the carried `sendEmail`; the inspector mocks it).
- An [Upstash](https://upstash.com) Redis database (free tier is plenty). See below.

## Upstash provisioning

The limiters speak to Upstash Redis over its REST API. Provision a database one of
two ways:

1. **Vercel Marketplace integration** — add the Upstash integration to your Vercel
   project; it provisions a database and injects `UPSTASH_REDIS_REST_URL` /
   `UPSTASH_REDIS_REST_TOKEN`.
2. **Upstash console** — create a free database at
   [console.upstash.com](https://console.upstash.com), open the database's **REST
   API** panel, and copy the **REST URL** and **REST token**.

Paste both into `.env` as `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
The single env boundary (`src/env.ts`) validates them at build time — a missing or
malformed value fails `next build` with the variable named.

## Setup

1. `cp .env.example .env`.
2. `docker compose up -d` — start local Postgres.
3. `pnpm install`.
4. Fill in `.env`. Generate the Better Auth secret with `openssl rand -base64 32`
   and paste it into `BETTER_AUTH_SECRET`; leave `BETTER_AUTH_URL=http://localhost:3000`.
   Paste your Upstash REST URL + token (see above).
5. `pnpm auth:generate` — write the four-table auth schema (carried; already present).
6. `pnpm db:migrate` — apply migrations (`email_suppressions`, the auth tables, and
   `rate_limit_log`).
7. `pnpm db:seed` — create the three verified accounts the inspector spam runs use
   (`alice@example.com`, `bob@example.com`, `eve@example.com`; password
   `correct-horse-staple`).
8. Run both servers (see "Two servers").

## The inspector

`/inspector` is the project's observation surface (provided in full — you write none
of it). It walks every gate:

- **Upstash up?** badge reads `pingRedis()`.
- **Remaining tokens** panel reads each limiter via `getRemaining(key)` — consumes no
  budget — paired with the static cap.
- **Spam X / Send one** run the gated actions deterministically (sign-in 11×,
  sign-up 6×, reset 4×) and the **recent-responses log** shows each outcome (the
  Result's real code) and the budget off the `ok` payload — no HTTP status, no
  headers.
- **Structured-log tail** shows the operator-honest `rate_limit_log` rows.
- **Failure-mode toggles** prove *why* the ordering is correct: "Force Upstash down"
  (fail-open), "Gate after work" / "Await pending" (timing), and the "Distinct IPs
  runner" (the cross-IP per-email catch).

Until the limiters and action wraps exist, the remaining panel reads `n/a` and the
spam buttons surface a "Not implemented" outcome — both without crashing.

## Verified-domain ceremony (recap from Chapter 048)

A transactional `from` address must live on a domain you control and have
**verified in Resend**. `EMAIL_FROM` in your `.env` must use an address on a verified
subdomain (e.g. `verify@send.yourdomain.com`). The inspector's reset runs mock the
send (`INSPECTOR_MOCK_EMAIL=1`), so no live Resend call fires during a demo.

## Environment variables

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | Local Postgres; both point at the Docker DB. |
| `SEED` | Seed PRNG seed (default 1). |
| `BETTER_AUTH_SECRET` | Signs cookies/tokens. `openssl rand -base64 32`. Server-only. |
| `BETTER_AUTH_URL` | The app's origin (`http://localhost:3000` locally). |
| `RESEND_API_KEY` | From the Resend dashboard. Server-only. |
| `EMAIL_FROM` | Full `Name <addr>` header on your verified domain. |
| `EMAIL_REPLY_TO` | A monitored reply address. |
| `UPSTASH_REDIS_REST_URL` | The Upstash database REST URL. Server-only. |
| `UPSTASH_REDIS_REST_TOKEN` | The Upstash database REST token. Server-only. |
| `NEXT_PUBLIC_APP_NAME` | Public app name. |
| `NEXT_PUBLIC_APP_URL` | Public app origin. |

## Seeding

`pnpm db:seed` clears `email_suppressions` + `rate_limit_log`, then creates three
verified email+password accounts (`alice`, `bob`, `eve`) so the inspector's spam runs
are reproducible across boots.

## Two servers

- `pnpm dev` — the Next app at <http://localhost:3000>. It opens on `/sign-in`.
- `pnpm email` — the React Email preview server at <http://localhost:3001>.

## Commands

See `AGENTS.md` for the full command list.
