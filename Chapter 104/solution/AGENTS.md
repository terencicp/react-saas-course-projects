# AGENTS.md

The chapter 104 PR-review project. The codebase is a **read-only audit target**: an in-memory SaaS app whose merged `feature/customer-plan-overview` change adds a `/plan` overview surface carrying five review-worthy defects plus one cache decision worth an ADR. No database, no auth, no external services: data lives in `src/server/store.ts` (a module singleton) and identity is the `acting-identity` cookie via `src/server/session.ts` (defaults to `org-acme:admin`, never redirects).

The deliverable is **two Markdown artifacts**, not application code — the student never patches the target:

- `reviews/chapter 104.md` — the five-comment review, written in the four-part shape from `reviews/template.md` against the five-layer review stack and the principle-and-pattern map (chapter 103).
- `docs/adr/0007-cache-entitlement-reads-with-cacheTag.md` — the Nygard ADR for the caching decision, plus its index row in `docs/adr/README.md` (chapter 101 lesson 4).

## Daily commands

- `pnpm dev` — run the dev server (`/plan` is the surface under review; `/invoices` and `/inspector` carry over).
- `pnpm verify` — Biome CI + typecheck + build (the gate). Passes with the defects in place.
- `pnpm test:lesson <n>` — run a single lesson verification file.
