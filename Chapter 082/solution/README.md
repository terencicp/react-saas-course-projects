# Chapter 082 — The pre-launch audit pass (seeded audit target)

This repository is a **seeded audit target**: a fork of the running SaaS app
(carried from the 067 org/RBAC/audit/auth + invoices + export lineage, grafted with
the 075 rate-limiter and the 065 Stripe webhook + `plan_entitlements`) with **ten
planted defects** — eight in scope, two bonus. Your deliverable is **not code**: it
is a committed `findings/` directory of Markdown, one file per defect, each on the
rule-location-consequence-fix template.

You run the target **read-only**. You never patch it. The proposed fix is a
paragraph, not a diff. The ten defects **ship green** on purpose: `pnpm verify`
passes with every bug in place — an audit reads a *running* target, so the bugs are
live, not stubbed.

## The eight audit categories

Run the two Unit 16 passes against the target, one finding per category (plus a
written "none" for any category you decide is clean):

1. **Fail-closed checks** (chapter 080 L1)
2. **XSS sinks** (080 L2 + 081 L1)
3. **Audit-log gaps** (081 L3)
4. **Security headers** (081 L1)
5. **Secrets** (081 L6 + env validation 081 L7)
6. **Rate-limit coverage** (081 L2)
7. **Dep hygiene** (081 L8)
8. **GDPR deletion** (081 L4)

The two bonus categories above the 8/8 floor: **consent gate** (081 L5) and a
**`safeLimit` bypass** on a worker endpoint (080 L3).

## The deliverable: `findings/`

- `findings/template.md` — the rule-location-consequence-fix contract. Copy it once
  per finding. **Never edit the target source.**
- `findings/001-fail-closed.md` … `findings/008-gdpr-deletion.md` — one file per
  category. Replace the placeholder body with your finding (all four sections).
- `findings/out-of-scope.md` — observations outside the eight categories (never
  scored as findings).
- `findings/SUMMARY.md` — the coverage scorecard + the two bonus findings + your
  personal grep/curl checklist.

Every finding fills all four template sections: **Rule** (the named chapter-080/081
rule + lesson section), **Location** (file + line range AND the grep/curl command
that surfaced it), **Consequence** (user-visible or legal terms, read-aloud test, no
"could potentially" hedging), and **Fix** (the senior reach named by its
helper/wrapper/config). Assign a severity, justified in two lines.

## The honor system

In the real course the starter ships via `degit` and the answer key lives behind a
`v1.0-answer-key` git tag you do not check out until you have committed your own
`findings/`. **Audit first, commit, then compare** — peeking before you commit
defeats the exercise. In *this* repository the answer key is `solution/findings/`
(this directory); the `start/` tree carries the same target with empty placeholders.

## Setup ladder

1. `cp .env.example .env`.
2. `pnpm install`.
3. `docker compose up -d` — start local Postgres 18.
4. `pnpm db:migrate && pnpm db:seed` — apply the migration set and seed the
   deterministic data (the seeded admin Alice, a second org, an invoice carrying a
   planted note, and the audit tail). All seed emails use `@example.com`.
5. `pnpm dev` — the app at <http://localhost:3000>.
6. Sign in as the seeded admin at <http://localhost:3000/sign-in> with email
   `alice@example.com` and password `inspector-password-12` (the `SEED_PASSWORD`
   constant in `scripts/seed.ts` — change it there to reseed with a different
   password). The protected surfaces (`/dashboard`, `/invoices/<id>`, `/settings`)
   all require this session, so sign in before reading them.

Then read the running app and the source side-by-side:

- the dashboard loads as the seeded admin;
- `/invoices/<seeded-id>` renders the planted note as **live bold HTML** (the XSS
  fingerprint — `pnpm db:seed` prints the exact path);
- the settings route mounts the secret-leaking client component;
- `curl -I http://localhost:3000/` returns HSTS but **no** `Content-Security-Policy`;
- PostHog fires on first load (the consent-gate bonus).

## What is NOT live in the pipeline

No Stripe CLI, no Upstash, no Trigger.dev worker, no live Resend/PostHog round-trip.
The pipeline boots Docker Postgres + `db:migrate` + `db:seed` only. The `.env` ships
dummy third-party keys so env validation passes at build with no round-trip. The
browser-invisible fingerprints (curl headers, DevTools network, repeated-submit
behavior, the PostHog request) are confirmed by static checks on the source plus the
lessons' by-hand checklist, not by a live integration.

## Commands

See `AGENTS.md` for the full command list. `pnpm verify` (`biome ci . && tsc
--noEmit && next build`) passes **with all ten defects in place** — that is the
premise of the audit.
