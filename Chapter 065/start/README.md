# Chapter 065 — From Stripe webhook to plan entitlement (starting code)

This is the starting code repo for the chapter 065 project of the React SaaS course.

You wire the `POST /api/webhooks/stripe` route that ingests three Stripe subscription
events and the derived `plan_entitlements` row the app reads on every request. The
webhook route, the dispatch + handlers, the projection, the entitlement read helpers,
and the three `billing.*` methods ship as compiling `TODO(L<n>)` stubs you fill across
the lessons — `rg "TODO\(L" src` enumerates the work.

This repo builds on the previous project: chapter 059 (org / RBAC / audit backend —
Better Auth organization plugin, `audit_logs`, `tenantDb`, `authedAction`,
`requireOrgUser`, the `(auth)` / `(protected)` surfaces). The Stripe and webhook
concepts are carried in from the chapter 063 (webhook ingestion) and 064 (Stripe
billing) teaching chapters.

## Setup

1. `cp .env.example .env` and fill it in (Better Auth + invitation secrets via
   `openssl rand -base64 32`; a Stripe test-mode `STRIPE_SECRET_KEY` starting with
   `sk_test_`).
2. `docker compose up -d` — start local Postgres 18.
3. `pnpm install`.
4. `pnpm db:migrate` — apply the 059 migration set plus the scaffold's
   `processed_events`, `plan_entitlements` (PK-only stub), and
   `organization.stripe_customer_id` migrations.
5. `pnpm db:seed` — seed two orgs / four users plus one `free` `plan_entitlements` row
   per org.
6. `stripe login`, then `pnpm stripe:listen` — forwards events to the local webhook and
   prints a `whsec_…` secret to paste into `STRIPE_WEBHOOK_SECRET`.
7. `pnpm seed:stripe` — create the pro/team Products + Prices in your test-mode account
   and rewrite `src/lib/billing/catalog.json`.
8. `pnpm dev` — opens on `/sign-in`. `/inspector` is the verification surface.

## Verify

`pnpm verify` runs `biome ci`, `tsc --noEmit`, and `next build`.

See `AGENTS.md` for the full command list.
