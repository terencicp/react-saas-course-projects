# Chapter 071 — The notification dispatcher (starting code)

This is the starting code repo for the chapter 071 project of the React SaaS course.

You assemble the notification dispatcher seam into one runnable surface on the carried-in
backend: a single `dispatch(event)` entry point every call site fires through, fanning
three events across an email channel and an in-app inbox channel. The registry, dedup,
dispatcher, prefs, the two channels, the barrel, the three notification schema tables, and
the three call-site additions ship as compiling `TODO(L<n>)` stubs you fill across the
lessons — `rg "TODO\(L" src` enumerates the work.

This repo builds on the previous project: chapter 065 (Stripe webhook → plan entitlement),
which itself carries the chain back through chapter 059 (org / RBAC / audit backend),
chapter 055 (auth), chapter 050 (email send), and chapters 047 / 041 / 035 / 028.

The `/inspector` Server Component is the verification surface; `/inbox` is the live inbox
read. At scaffold both render as non-throwing placeholders: the fire buttons surface the
`dispatch not implemented` error string and the inbox is empty until you fill the stubs.
`EMAIL_MOCK=1` (the default) keeps the email-sent counter deterministic with no live Resend.

## Setup

1. `cp .env.example .env` and fill it in (Better Auth + invitation secrets via
   `openssl rand -base64 32`; a Stripe test-mode `STRIPE_SECRET_KEY` starting with
   `sk_test_`).
2. `docker compose up -d` — start local Postgres 18.
3. `pnpm install`.
4. `pnpm db:migrate` — apply the carried chapter-065 migration set. The three notification
   tables (`notifications`, `user_notification_preferences`, `notification_dedup`) are your
   S1 output (`pnpm db:generate --name add_notifications` after uncommenting the schema) —
   absent from the scaffold; the carried app boots without them.
5. `pnpm db:seed` — seed two orgs / four users plus one `free` `plan_entitlements` row per
   org (and, once the notification tables exist, Bob's `team`→`email:false` prefs row).
6. `pnpm dev` — opens on `/sign-in`. `/inspector` is the verification surface.

## Verify

`pnpm verify` runs `biome ci`, `tsc --noEmit`, and `next build`.

See `AGENTS.md` for the full command list.
