# AGENTS.md

The org-scoped invoicing data layer — the first DB project: a Drizzle schema as the single source of truth, an init migration, a deterministic seed, and two tenant-scoped reads (cursor list + single-round-trip detail), surfaced by a provided `/inspector` Server Component. Forked from the Chapter 035 toolchain.

## Stack core (May 2026)

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 (CSS-first) · shadcn/ui · next-themes · Zod 4 · Drizzle ORM 0.45 (postgres-js driver) · Postgres 18 (Docker).

## Repo layout

- `src/app/` — App Router: root `layout.tsx`, `page.tsx` (redirects to `/inspector`), `globals.css`, `_components/providers.tsx`; the `inspector/` segment holds the page, its `loading.tsx` Suspense seam, the `reseed` Server Action, and `_components/` (counts banner, header, list/detail/plan panels).
- `src/components/ui/` — shadcn primitives.
- `src/db/` — `index.ts` (the `db` client + Relations v1 wiring), `columns.ts` (`timestamps`), `cursor.ts` (opaque cursor helpers), `schema.ts` (the six tables — the single source of truth), `relations.ts` (Relations v1).
- `src/lib/invoices/` — `schema.ts` (read-boundary Zod), `queries.ts` (the two tenant-scoped reads), `counts.ts` (row counts + org list), `explain.ts` (provided EXPLAIN probes).
- `src/env.ts` — the only env boundary (`@t3-oss/env-nextjs`); application code imports `env`, never `process.env`.
- `scripts/seed.ts` — the deterministic, idempotent seed (`runSeed` export + CLI); `scripts/test-lesson.mjs` runs one lesson test.
- `tests/lessons/` — one `Lesson <n>.test.ts` per implementation lesson.

## Daily commands

- `docker compose up -d` — start local Postgres 18.
- `pnpm db:generate` — generate a migration from the schema (pass `--name <verb>_<noun>`).
- `pnpm db:migrate` — apply migrations to the local DB.
- `pnpm db:seed` — run the deterministic seed.
- `pnpm db:studio` — open Drizzle Studio.
- `pnpm dev` — run the dev server.
- `pnpm build` — production build.
- `pnpm check` — Biome format + lint + organize imports (writes).
- `tsc --noEmit` — typecheck.
- `pnpm verify` — Biome CI + typegen + typecheck + build (the gate; needs `DATABASE_URL` set).
- `pnpm test:lesson <n>` — run a single lesson test.

## Conventions

Code style is enforced by `biome.json`; TypeScript strictness by `tsconfig.json`; editor settings by `.editorconfig`.
