# Chapter 075 — Upstash rate limits on the auth surface

This is the starting code repo for the chapter 075 project of the React SaaS course.

This repo builds on the previous projects: 028, 035, 041, 047, 050, 055.

## What you build

Layer three `@upstash/ratelimit` limiters onto the carried-in email + password auth
surface at the Server Action seam: sign-in (per-IP + per-email), sign-up (per-IP),
and password reset (per-IP + per-email). Better Auth's built-in limiter goes off, so
the application-level limiters are the single enforcement point. The provided
`/inspector` route drives every observation.

Run `rg "TODO\(L" src` to enumerate the student-owned regions.

## Setup

1. `cp .env.example .env` and fill in the values (Postgres, Better Auth, Resend, and
   the two `UPSTASH_REDIS_REST_*` keys from an Upstash database's REST API panel).
2. `docker compose up -d` — start local Postgres.
3. `pnpm install`.
4. `pnpm db:migrate` — apply migrations.
5. `pnpm db:seed` — create the three verified accounts the inspector uses
   (`alice@example.com`, `bob@example.com`, `eve@example.com`).
6. `pnpm dev`.

See `AGENTS.md` for the full command list.
