# AGENTS.md

The Chapter 082 **seeded audit target**: a fork of the running SaaS app (059
org/RBAC/audit/auth backend + 062 invoices + 050 Resend send path + the 067
Trigger.dev export job), grafted with the 075 rate-limiter (`lib/rate-limit.ts` +
`safeLimit`) and the 065 Stripe webhook + `plan_entitlements`, with **ten planted
defects** (eight in scope + two bonus). The deliverable is `findings/` Markdown — NOT
code. The target is **read-only**: no agent and no student patches it; every defect
ships green so `pnpm verify` passes with the bugs live.

The tenancy seam is unchanged from the lineage: `requireOrgUser()` resolves
`{ user, orgId, role }` from the validated session, `tenantDb(orgId)` is the only
scoped data facade, and `authedAction(role, schema, fn)` is the only privileged
Server Action shape. `audit_logs` is append-only (RLS deny UPDATE/DELETE); `logAudit`
writes inside a transaction (explicit-context form for session-less callers).

## The deliverable

`findings/` at the repo root: `template.md` (the rule-location-consequence-fix
contract), eight numbered finding files (001–008), `out-of-scope.md`, and
`SUMMARY.md`. The `start/` tree carries empty placeholders; the answer key is
`solution/findings/`. No finding ships a fix as a diff; a structural snippet is
allowed per the template.

## The ten seeded defects

1. Fail-closed bypass — `src/lib/admin/transfer-ownership.ts` (try/catch around
   `requireRole('owner')` that falls through).
2. XSS sink — `src/app/(protected)/invoices/[id]/notes.tsx`
   (`dangerouslySetInnerHTML` on user content; `biome-ignore`d so it ships green).
3. Missing audit-log write — `src/lib/billing/transfer-ownership.ts` (UPDATE in a tx,
   no audit row).
4. CSP omission — `next.config.ts` ships five static headers but no CSP; `src/proxy.ts`
   generates no nonce.
5. Secret in `NEXT_PUBLIC_*` — `src/env.ts` + `src/app/(protected)/settings/resend-test.tsx`.
6. Missing rate limit on password-reset — `src/app/api/auth/reset-password/route.ts`
   (Resend send, no limiter; `resetLimiter` declared but unwired).
7. Dep-hygiene gap — `pnpm-workspace.yaml` (`minimumReleaseAge: 0`,
   `blockExoticSubdeps: false`, `strictDepBuilds: false`) + a `pnpm audit` pin.
8. GDPR deletion gap — `src/lib/account/delete-account.ts` (one-row delete; the healthy
   async job is `trigger/delete-user.ts`).
9. (bonus) Consent gate missing — `src/app/_components/providers.tsx`
   (`opt_out_capturing_by_default: false`, no consent provider).
10. (bonus) `safeLimit` bypass — `src/app/api/exports/trigger/route.ts`
    (bare `limiter.limit()`).

## What is NOT live in the pipeline

No Stripe CLI, no Upstash, no Trigger.dev worker, no live Resend/PostHog round-trip.
The pipeline boots Docker Postgres + `db:migrate` + `db:seed` only; `.env` ships dummy
third-party keys so env validation passes at build. Rendered checks target only the
seeded Postgres surfaces (dashboard, the invoice note rendering as live HTML, the
resend-test client component mounting). Curl headers, DevTools network, repeated-submit
behavior, and the PostHog request are confirmed by static checks + the by-hand
checklist.

## Stack core (May 2026)

Next.js 16 (App Router, Cache Components, `proxy.ts`) · React 19 · TypeScript 6 ·
Tailwind v4 · shadcn/ui · Zod 4 · Better Auth (Drizzle adapter + organization plugin)
· Drizzle ORM 0.45 (postgres-js) · Postgres 18 (Docker, RLS on `audit_logs`) · Resend
· React Email 6 · Stripe · `@upstash/ratelimit` + `safeLimit` · Trigger.dev v4 ·
posthog-js · pino.

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
(single dot): `org.ownership-transferred`, `account.deletion-completed`,
`consent.recorded`. The `Result` code set is the seven from 080 L2 (no
`plan_limit`/`payment_required`). pnpm supply-chain settings live in
`pnpm-workspace.yaml`, never `.npmrc`. The env file is `src/env.ts` (`@/env`), never
`lib/env.ts`. Do NOT modify the target source — the defects are seeded on purpose.
