# Chapter 095 — Wire observability, audit performance (starting code)

This is the starting code repo for the chapter 095 project of the React SaaS course.

This repo builds on the previous project: chapter 082 (the audit pass), which itself
carries the merged 059 (org/RBAC/audit/auth) + 062 (invoices) + 065 (Stripe webhook +
`plan_entitlements`) + 067 (Trigger.dev export job) + 075 (rate-limiter) lineage, with
082's eight findings pre-fixed.

## What this repo is

A **seeded audit target**: the running SaaS app grafted with the Unit 19 carry-in (the
Pino logger, `posthog-js`, the Vercel analytics floor) and **ten planted defects** —
eight in scope, two bonus. The defects **ship green**: `pnpm verify` passes with every
bug in place, because an audit reads a *running* target.

Your work is **hybrid**:

- **Observability findings 1–4 are wired (real TypeScript).** Install Sentry, harden the
  Pino logger (one `redact` seam + correlation IDs), and gate PostHog behind consent.
- **Performance findings 5–8 are documented (Markdown), not patched.** The deliverable is
  the `findings/` report. The sole in-place code fix is finding 6 (the `lucide-react`
  barrel) — one line in `next.config.ts`.

The student work is enumerated by the `TODO` markers: `rg "TODO" .` finds the wiring
stubs (in `next.config.ts`, `src/env.ts`, `src/lib/logger.ts`, `src/proxy.ts`, the Stripe
webhook handler, and `src/app/_components/providers.tsx`) and the empty `findings/`
placeholders. The answer key is the `solution/` tree — wire, prove, document, then
self-grade against it.

## The deliverable: `findings/`

- `findings/template.md` — the rule-location-consequence-fix contract. Copy it once per
  finding.
- `findings/001-sentry-not-wired.md` … `findings/008-n-plus-1-invoices.md` — one file per
  category; replace each placeholder body with all four sections.
- `findings/009-missing-next-font.md` / `findings/010-composite-index.md` — the optional
  bonus findings above the 8/8 floor.
- `findings/screenshots/` — the analyzer before/after (`before-barrel.png` /
  `after-barrel.png`) that finding 006 embeds, captured by hand from your own
  `pnpm next experimental-analyze` run.
- `findings/out-of-scope.md` — observations outside the eight categories (never scored).
- `findings/SUMMARY.md` — the coverage scorecard + the two bonus findings + your personal
  diagnostic checklist.

## Setup ladder

1. `pnpm install`.
2. `cp .env.example .env` (and `.env.local` for `next dev`); populate the Sentry / PostHog
   keys once you wire them (dummy values pass validation with no round-trip).
3. `docker compose up -d` — start local Postgres 18.
4. `pnpm db:migrate && pnpm db:seed` — apply the migration set and seed the deterministic
   data (the seeded admin Alice + org, ~30 customers, invoices each linked to a customer,
   ≥3 members). All seed emails use `@example.com`.
5. `pnpm dev` — the app at <http://localhost:3000>.

See `AGENTS.md` for the full command list. `pnpm verify` (`biome ci . && tsc --noEmit &&
next build`) passes **with all ten defects in place** — that is the premise of the audit.
