# Chapter 095 — Wire observability, audit performance (seeded audit target)

This repository is a **seeded audit target**: a fork of the running SaaS app (the
082 lineage — 059 org/RBAC/audit/auth, 062 invoices, 065 Stripe webhook +
`plan_entitlements`, 067 Trigger.dev export job, 075 rate-limiter — with **082's eight
findings pre-fixed**), grafted with the Unit 19 carry-in (Pino logger, `posthog-js`,
the Vercel analytics floor) and **ten NEW planted defects** — eight in scope, two
bonus.

This project's deliverable is **hybrid**:

- **Observability findings 1–4 are *wired* (real TypeScript).** You install Sentry,
  harden the Pino logger (one `redact` seam + correlation IDs), and gate PostHog
  behind consent. This wiring is the difference between `start/` and `solution/`.
- **Performance findings 5–8 are *documented* (Markdown), not patched.** The
  deliverable is a `findings/` report a senior attaches to a launch review. The sole
  in-place code fix is finding 6 (the `lucide-react` barrel) — one line in
  `next.config.ts` — because the bundle-analyzer before/after is the required
  evidence.

The ten defects **ship green** on purpose: `pnpm verify` passes with every bug in
place — an audit reads a *running* target, so the bugs are live, not stubbed.

## The eight audit categories (plus two bonus)

Run both halves of Unit 19 against the target, one finding per category:

1. **Sentry init + source maps + release** (092 L1) — *wired* (finding 001)
2. **Structured-log secret leak / the 3am rule** (092 L3) — *wired* (finding 002)
3. **Request correlation IDs** (092 L2) — *wired* (finding 003)
4. **PostHog consent gate** (093 L3 + 081 L5) — *wired* (finding 004)
5. **RSC waterfall** (094 L6) — *documented* (finding 005)
6. **Barrel import / `optimizePackageImports`** (094 L3/L4) — *documented + the one
   in-place fix* (finding 006)
7. **Missing `preload` on the LCP image** (094 L2) — *documented* (finding 007, the
   reference finding)
8. **N+1 at the Drizzle layer** (094 L7) — *documented* (finding 008)

The two bonus findings above the 8/8 floor: **the marketing-page font via a raw
`<link>`** (next/font, 094 L1/L2) and **the missing composite `(org_id, created_at)`
index on `invoices`** (094 L7, proven with `EXPLAIN ANALYZE`).

## The deliverable: `findings/`

- `findings/template.md` — the rule-location-consequence-fix contract. Copy it once
  per finding.
- `findings/001-sentry-not-wired.md` … `findings/008-n-plus-1-invoices.md` — one file
  per category. Replace the placeholder body with your finding (all four sections).
- `findings/screenshots/` — the analyzer before/after (`before-barrel.png` /
  `after-barrel.png`) that finding 006 embeds — captured by hand from your own
  `pnpm next experimental-analyze` run.
- `findings/out-of-scope.md` — observations outside the eight categories (never
  scored).
- `findings/SUMMARY.md` — the coverage scorecard + the two bonus findings + your
  personal diagnostic checklist.

Every finding fills all four template sections: **Rule** (the named chapter-092/093/094
rule + lesson section), **Location** (file + line range AND the diagnostic
command/surface — a grep, a DevTools trace, the Network panel, `pnpm next
experimental-analyze`, `.toSQL()`, `EXPLAIN ANALYZE`), **Consequence** (operator- or
user-visible: a timing, a leaked secret, lost data — never "code smell"), and **Fix**
(the seam installed, for the wired findings; the senior reach named by its
helper/config, for the documented ones). Assign a severity, justified in two lines.

## The honor system

The answer key is `solution/findings/`; the `start/` tree carries the same target
with empty placeholders. **Wire, prove, document, then self-grade** against the
answer key — peeking before you finish your own pass defeats the exercise.

## Setup ladder

1. `pnpm install`.
2. `cp .env.example .env` (and `.env.local` for `next dev`); populate the Sentry /
   PostHog keys once you wire them (dummy values pass validation with no round-trip).
3. `docker compose up -d` — start local Postgres 18.
4. `pnpm db:migrate && pnpm db:seed` — apply the migration set and seed the
   deterministic data (the seeded admin Alice + org_acme, ~30 customers, 240 invoices
   each linked to a customer, ≥3 members). All seed emails use `@example.com`.
5. `pnpm dev` — the app at <http://localhost:3000>.
6. Sign in as the seeded admin at <http://localhost:3000/sign-in> with email
   `alice@example.com` and password `inspector-password-12` (the `SEED_PASSWORD`
   constant in `scripts/seed.ts`).

Then read the running app and the source side-by-side:

- the marketing page (`/`) renders the hero `<Image>` (finding 7) and the raw-`<link>`
  font (bonus 9);
- `/dashboard` loads as the seeded admin with the sequential-await RSC body (finding 5)
  and the barrel-icon nav (finding 6);
- `GET /api/test/throw` renders the default Next error page with no Sentry event
  (finding 1's proof target);
- a webhook replay logs the `stripe-signature` in the clear (finding 2);
- a fresh load fires a PostHog request before consent (finding 4).

## What is NOT live in the pipeline

No Stripe CLI, no Upstash, no Trigger.dev worker, no live Sentry/PostHog/Resend
round-trip. The pipeline boots Docker Postgres + `db:migrate` + `db:seed` only. The
`.env` ships dummy third-party keys so env validation passes at build. The
browser-invisible proof surfaces (the Sentry dashboard, DevTools Network, the analyzer
treemap, DevTools traces) are confirmed by static checks on the source plus the
lessons' by-hand checklist, not by a live integration.

## Commands

See `AGENTS.md` for the full command list. `pnpm verify` (`biome ci . && tsc
--noEmit && next build`) passes **with all ten defects in place** — that is the
premise of the audit.
