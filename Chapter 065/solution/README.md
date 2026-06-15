# Chapter 065 — From Stripe webhook to plan entitlement

Wire the production async edge a SaaS grows into, on the carried-in Chapter 059
org/RBAC/audit backend: the `POST /api/webhooks/stripe` route that ingests three
Stripe subscription events, and the derived `plan_entitlements` row the app reads on
every request.

- **The webhook trust boundary** — read the raw body once, verify the signature
  before parsing or logging, answer `400 application/problem+json` on failure.
- **Verify → claim → mutate in one `db.transaction`** — `claimEvent` against
  `processed_events` dedupes a replay; the ordering predicate lives in the UPDATE's
  `WHERE` so a stale event is a silent no-op.
- **The derived-view projection** — a pure `subscriptionToEntitlement` plus the
  single-writer rule: only the webhook writes `plan_entitlements`, every other
  surface reads (`getEntitlement` / `hasActiveAccess`).
- **The thin SDK seam** — `lib/billing/` is the only place `stripe` is imported,
  exposing exactly `upgrade` / `openPortal` / `requirePlan`.
- **Tenancy hardening** — the `organization_id` carry-channel in
  `subscription_data.metadata`, cross-checked against the Customer-owned org.

The `/inspector` Server Component is the verification surface (entitlement panel,
`processed_events` tail, audit tail, Checkout/Portal buttons, dev debug controls).
`/inspector/pro-only` is the load-bearing `requirePlan('pro')` gate; the seeded
`free` org renders its `error.tsx` "Upgrade to Pro" fallback.

This is a scaffold: the webhook route, the dispatch + handlers, the projection, the
entitlement read helpers, and the three `billing.*` methods ship as compiling `TODO`
stubs the lessons fill (`rg "TODO(L" src` enumerates the work).

## Prerequisites

- Node 24, pnpm 11.3 (`engine-strict` is on; the `preinstall` guard blocks non-pnpm).
- Docker (for local Postgres 18).
- A [Resend](https://resend.com) account with a **verified sending domain** (see below).
- A **Stripe test-mode** account and the [Stripe CLI](https://docs.stripe.com/stripe-cli)
  (for `stripe listen` / `stripe trigger`).

## Setup

1. `cp .env.example .env`.
2. `docker compose up -d` — start local Postgres.
3. `pnpm install`.
4. Fill in `.env`. Generate the Better Auth secret with `openssl rand -base64 32`
   and paste it into `BETTER_AUTH_SECRET`; generate a **distinct** value the same
   way for `INVITATION_SIGNING_SECRET`. Paste your Stripe test-mode secret key into
   `STRIPE_SECRET_KEY` (must start with `sk_test_` — the env boundary refuses a live
   key at boot). Leave the URLs at `http://localhost:3000`.
5. `pnpm db:migrate` — apply the 059 migration set plus the scaffold's
   `processed_events`, `plan_entitlements` (PK stub), and `organization.stripe_customer_id`
   migrations.
6. `pnpm db:seed` — seed the orgs/users + one `free` `plan_entitlements` row per org
   (see Seeding).
7. `stripe login`, then **`pnpm stripe:listen`** — forwards events to
   `localhost:3000/api/webhooks/stripe` and prints a `whsec_…` signing secret. Paste
   it into `STRIPE_WEBHOOK_SECRET` and restart `pnpm dev`.
8. **`pnpm seed:stripe`** — creates the pro/team Products + monthly Prices in your
   test-mode account (idempotent, find-or-create by `lookup_key`) and rewrites
   `src/lib/billing/catalog.json` with the real `lookup_key`s.
9. `pnpm dev` (see "Two servers"). Fire `stripe trigger checkout.session.completed`
   — until Lesson 2 the route 404s (the scaffold's starting line).

## Verified-domain ceremony (recap from Chapter 048)

A transactional `from` address must live on a domain you control and have
**verified in Resend**, or mailbox providers will spam-folder or reject the
message. The one-time ceremony:

1. In the Resend dashboard, add your sending domain (use a subdomain like
   `send.yourdomain.com` so a deliverability mistake never poisons your root
   domain's reputation).
2. Resend gives you DNS records (SPF, DKIM, DMARC, return-path). Add them at your
   DNS host, wait for propagation, then click **Verify** in Resend.

`EMAIL_FROM` in your `.env` must use an address on this verified subdomain (e.g.
`verify@send.yourdomain.com`).

## Environment variables

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | Local Postgres; both point at the Docker DB. |
| `SEED` | Seed PRNG seed (default 1). |
| `BETTER_AUTH_SECRET` | Signs cookies/tokens. `openssl rand -base64 32`. Server-only. |
| `BETTER_AUTH_URL` | The app's origin (`http://localhost:3000` locally). |
| `INVITATION_SIGNING_SECRET` | HMAC key for the signed accept URL. **Distinct** from `BETTER_AUTH_SECRET`. `openssl rand -base64 32`. Server-only. |
| `RESEND_API_KEY` | From the Resend dashboard. Server-only. |
| `EMAIL_FROM` | Full `Name <addr>` header on your verified domain. |
| `EMAIL_REPLY_TO` | A monitored reply address. |
| `NEXT_PUBLIC_APP_NAME` | Public app name. |
| `NEXT_PUBLIC_APP_URL` | Public app origin — the base host for the signed accept URL. |
| `STRIPE_SECRET_KEY` | Stripe test-mode secret. **Must start with `sk_test_`** — the env boundary refuses a live key. Server-only. |
| `STRIPE_WEBHOOK_SECRET` | The `whsec_…` value `pnpm stripe:listen` prints; `constructEvent` verifies against it. Server-only. |
| `APP_URL` | App origin the Checkout success/cancel URLs are built from. |
| `STRIPE_PORTAL_RETURN_URL` | Where the Billing Portal returns the customer. |

## Seeding

`pnpm db:seed` lays down a deterministic multi-tenant fixture: two orgs (Acme,
Globex), four users (Alice owner / Bob admin / Carol member of Acme, Dave owner of
Globex), one pending invitation in Acme (a fixed token whose canonical accept URL
the seed prints on run), one seeded `member.role-changed` audit row, and **one
`free` `plan_entitlements` row per org** (the org's `stripe_customer_id` stays null —
no Stripe round-trip in the seed). The seed runs as the superuser `postgres`
(`BYPASSRLS`), so the fixture inserts clear the FORCE-RLS policy without `withTenant`.

`pnpm seed:stripe` is a **separate**, idempotent script that talks to your test-mode
Stripe account (not the DB): it creates the pro/team Products + monthly Prices and
rewrites `src/lib/billing/catalog.json` with the real `lookup_key`s. Run it once
after filling `STRIPE_SECRET_KEY`.

## Two servers

The app and the email preview run side by side:

- `pnpm dev` — the Next app at <http://localhost:3000>. It opens on `/sign-in`.
- `pnpm email` — the React Email preview server at <http://localhost:3001>
  (`--dir ./src/emails`, `--port 3001` to avoid the dev-server clash).

Use the preview server when iterating on the invite template itself (live reload,
light/dark toggle, mobile reflow).

## Commands

See `AGENTS.md` for the full command list.
