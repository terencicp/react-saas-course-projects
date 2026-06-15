# AGENTS.md

The Chapter 095 **seeded audit target**: a fork of the 082 lineage (059
org/RBAC/audit/auth + 062 invoices + 050 Resend send path + 065 Stripe webhook +
067 Trigger.dev export job + 075 rate-limiter) with **082's eight findings pre-fixed**,
grafted with the Unit 19 carry-in (Pino logger, `posthog-js`, the Vercel analytics
floor) and **ten NEW planted defects** (eight in scope + two bonus).

The deliverable is **hybrid**: observability findings 1–4 are *wired* (real
TypeScript — the diff between `start/` and `solution/`); performance findings 5–8 are
*documented* in `findings/` Markdown and never patched, except the one
`optimizePackageImports` line for finding 6. The target ships every defect **green**
so `pnpm verify` passes with the bugs live — an audit reads a *running* target.

The tenancy seam is unchanged from the lineage: `requireOrgUser()` resolves
`{ user, orgId, role }` from the validated session, `tenantDb(orgId)` is the only
scoped data facade, and `authedAction(role, schema, fn)` is the only privileged
Server Action shape. `audit_logs` is append-only (RLS deny UPDATE/DELETE); `logAudit`
writes inside a transaction (explicit-context form for session-less callers).

## The deliverable

`findings/` at the repo root: `template.md` (the rule-location-consequence-fix
contract), eight numbered finding files (001–008), `screenshots/` (the analyzer
before/after finding 006 embeds), `out-of-scope.md`, and `SUMMARY.md`. The `start/`
tree carries empty placeholders; the answer key is `solution/findings/`. The
documented findings ship no fix as a diff; a structural snippet is allowed per the
template.

## The ten NEW seeded defects

**Observability (wired by the slices):**

1. Sentry not wired — no instrumentation files, `next.config.ts` not wrapped with
   `withSentryConfig`, `SENTRY_*` absent from `src/env.ts`. Proof target:
   `GET /api/test/throw`.
2. Structured-log secret leak — `src/lib/logger.ts` has no `redact` slot;
   `src/app/api/webhooks/stripe/route.ts` logs the full headers (incl.
   `stripe-signature`).
3. Missing request correlation IDs — `src/proxy.ts` mints no `x-request-id`;
   `src/lib/request-context.ts` does not exist; the logger has no `requestId` mixin.
4. PostHog consent gate missing — `src/app/_components/providers.tsx` inits PostHog
   unconditionally with `opt_out_capturing_by_default: false`;
   `src/lib/analytics/consent.ts` does not exist.

**Performance (documented; only #6 is fixed in-place):**

5. RSC waterfall — `src/app/(protected)/dashboard/page.tsx` awaits user → org →
   invoices → members sequentially (invoices + members are independent).
6. Barrel import of `lucide-react` — `src/app/(protected)/layout.tsx` imports a dozen
   icons via the barrel; `next.config.ts` does not list `lucide-react` under
   `experimental.optimizePackageImports` (slice S5 adds the one line).
7. Missing `preload` on the LCP image — `src/app/(marketing)/page.tsx` hero `<Image>`
   ships `src`/`alt`/`width`/`height` but no `preload`.
8. N+1 in the invoice list — `src/db/queries/invoices-with-customer.ts` runs
   `db.select().from(invoices)` then loops to fetch each customer.

**Bonus:** 9 — marketing-page font via a raw `<link>` in
`src/app/(marketing)/layout.tsx`; 10 — missing composite `(org_id, created_at)` index
on `invoices` in `src/db/schema.ts`.

## What is NOT live in the pipeline

No Stripe CLI, no Upstash, no Trigger.dev worker, no live Sentry/PostHog/Resend
round-trip. The pipeline boots Docker Postgres + `db:migrate` + `db:seed` only; `.env`
ships dummy third-party keys so env validation passes at build. Rendered checks target
only the seeded Postgres surfaces (the marketing hero, the authenticated dashboard +
nav). The Sentry/PostHog dashboards, the analyzer treemap, and DevTools traces are
confirmed by static checks + the by-hand checklist.

## Stack core (May 2026)

Next.js 16 (App Router, Cache Components, `proxy.ts`) · React 19 · TypeScript 6 ·
Tailwind v4 · shadcn/ui · Zod 4 · Better Auth (Drizzle adapter + organization plugin)
· Drizzle ORM 0.45 (postgres-js) · Postgres 18 (Docker, RLS on `audit_logs`) · Resend
· React Email 6 · Stripe · `@upstash/ratelimit` + `safeLimit` · Trigger.dev v4 ·
`@sentry/nextjs` · posthog-js · pino · `@vercel/analytics` + `@vercel/speed-insights`.

## Daily commands

- `docker compose up -d` — start local Postgres 18.
- `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:studio` — Drizzle.
- `pnpm dev` — the Next app at <http://localhost:3000>.
- `pnpm verify` — `biome ci . && tsc --noEmit && next build` (the gate; passes with all
  ten defects in place).
- `pnpm test:lesson <n>` — run a single `tests/lessons/Lesson <n>.test.ts`.
- `pnpm check` — Biome (writes). `pnpm email` — React Email preview (port 3001).

## Conventions

The eight audit categories are exhaustive for this pass; anything else goes in
`out-of-scope.md`, never scored. Canonical audit-event naming is `entity.verb-pasttense`
(single dot): `org.ownership-transferred`, `account.deletion-completed`. The new
analytics consent event is `analytics_consent_granted` (a PostHog event name,
snake_case, NOT an audit-log slug). The `Result` code set is the seven from 080 L2.
pnpm supply-chain settings live in `pnpm-workspace.yaml`, never `.npmrc`. The env file
is `src/env.ts` (`@/env`). Observability findings 1–4 ARE wired (the slices edit the
target); performance findings 5–8 are documented, never patched (only the one
`optimizePackageImports` line for finding 6).
