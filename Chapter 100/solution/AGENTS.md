# AGENTS.md

Ship to production, then live-migrate the schema. A live, org-scoped invoices app
(forked from the Chapter 059 org/RBAC/audit backend, with the Chapter 062 invoices
surface re-expressed on Drizzle) whose `invoices.total numeric(12,2) NOT NULL` is
split into separate `subtotal` + `tax` columns via the **expand-migrate-contract**
cadence — three reviewed migrations run against a real Postgres, with the running
app and the live schema never incompatible.

The deployment half (Vercel/Neon/GitHub/Sentry) is by-hand: `solution/` makes no
deploy-platform call at runtime. The inspector reads `VERCEL_ENV` /
`VERCEL_GIT_COMMIT_SHA` only and falls back to a `development`/`local` render. The
runbooks under `docs/runbooks/` are the by-hand artifacts.

No new app features: one money-column split, the carried-in invoices CRUD. No email
(RESEND_API_KEY is validated-not-used), no billing, no rate limiting, no jobs.

## Stack core (May 2026)

Next.js 16 (App Router, Cache Components, proxy, `typedRoutes`) · React 19 ·
TypeScript 6 · Tailwind v4 (CSS-first) · shadcn/ui · nuqs (URL state) · Zod 4 ·
Better Auth (Drizzle adapter + organization plugin) · Drizzle ORM 0.45 (postgres-js
driver) · Postgres 18 (Docker, RLS on `audit_logs`) · sonner.

## Repo layout

- `src/app/` — App Router: root `layout.tsx`, `page.tsx` (redirects to `/invoices`),
  `_components/`. `(auth)/` holds `sign-up` + `sign-in`. `(protected)/` holds the
  gated `layout.tsx`, `dashboard/`, `invoices/` (the carried-in list + edit surface),
  `inspector/` (the migration verification surface), and `sign-out-action.ts`.
  `api/auth/[...all]/route.ts` is the auth catch-all; `api/health/route.ts` is the
  launch-checklist probe (`await connection()` → `select 1`, no segment config).
- `src/proxy.ts` — cookie-presence gate over `/dashboard`, `/invoices`, `/inspector`.
- `src/components/ui/` — shadcn primitives.
- `src/db/` — `index.ts` (the `db`/`dbUnpooled` clients + `Transaction`), `schema.ts`
  (the `invoices` table — the migration target), `relations.ts`, `schema/auth.ts`
  (CLI-generated org tables), `audit.ts` (`audit_logs` + RLS), `tenant.ts`
  (`withTenant` + `tenantDb`), `audit-log.ts` (`logAudit`), `queries/`.
- `src/lib/invoices/` — `actions.ts` (the dual-write/contract — student-owned),
  `queries.ts` (the dual-read — student-owned), `scoped-query.ts` (lifecycle + org
  predicates), `search-params.ts` (the nuqs cache).
- `src/lib/` — `auth.ts`, `auth-client.ts`, `auth-schema.config.ts`, `auth/*`,
  `result.ts`, `redirects.ts`, `utils.ts`.
- `src/env.ts` — the only env boundary (the launch-checklist validator).
- `scripts/seed.ts` — the deterministic seed; `scripts/backfill_subtotal_tax.ts` —
  the by-hand backfill (`pnpm db:backfill`); `scripts/test-lesson.mjs`.
- `docs/runbooks/` — launch-checklist / migration-log / rollback (by-hand artifacts).
- `tests/lessons/` — one `Lesson <n>.test.ts` per lesson.

## Daily commands

- `docker compose up -d` — start local Postgres 18.
- `pnpm db:generate --name <verb>_<noun>` — generate a reviewed migration. Never `push`.
- `pnpm db:migrate` — apply migrations.
- `pnpm db:seed` — run the deterministic seed.
- `pnpm db:backfill` — run the by-hand backfill (against `dbUnpooled`).
- `pnpm dev` / `pnpm build` — dev / production build.
- `pnpm check` — Biome format + lint + organize imports (writes).
- `pnpm verify` — Biome CI + `tsc --noEmit` + `next build` (the gate; needs env).
- `pnpm test:lesson <n>` — run a single lesson test.

## Conventions

Code style is enforced by `biome.json`; TS strictness by `tsconfig.json`.
`organization()` goes BEFORE `nextCookies()` in `plugins`. `requireOrgUser` reads the
role fresh from the membership row, never a query param. `tenantDb`/`withTenant` are
the only scoped data paths; the money mutation + its `logAudit` row co-transact in
one `withTenant`. `authedAction` is the only privileged action shape (refusals return
a `Result`, never throw). The migration is forward-only: expand adds nullable columns,
migrate dual-writes one `.set({ subtotal, tax, total })` + reads via a `sql\`coalesce(…)\``
fragment (Drizzle 0.45 ships no `coalesce` helper) + an idempotent backfill, then
promotes to NOT NULL; contract drops `total` last. The inspector's probes are raw
`db.execute(sql\`…\`)` against `information_schema` — never typed against the schema —
so they render at every cadence stage. Invalidation is `revalidatePath` only.
