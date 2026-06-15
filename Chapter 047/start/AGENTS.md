# AGENTS.md

A full CRUD surface on the org-scoped invoicing data layer (forked from Chapter 041): a "new invoice" form, an "edit invoice" form, and a delete-with-confirmation button. Every mutation flows through one of three Server Actions, each `safeParse`-ing `FormData` against a `drizzle-zod`-derived schema, each returning the canonical `Result`, each `revalidatePath`-ing the list. Native React 19 forms (`useActionState` + uncontrolled inputs), `useOptimistic` on create, a transactional delete, and a JS-disabled path that still creates/edits/deletes.

## Stack core (May 2026)

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 (CSS-first) · shadcn/ui · next-themes · Zod 4 · Drizzle ORM 0.45 (postgres-js driver) · drizzle-zod 0.8 · Postgres 18 (Docker) · sonner.

## Repo layout

- `src/app/` — App Router: root `layout.tsx` (mounts `<Toaster/>`), `page.tsx` (redirects to `/invoices`), `globals.css`, `_components/` (providers, the shared `SubmitButton` + `FieldError`); the `invoices/` segment holds the list page + its `loading.tsx`, `new/` (create form), `[invoiceId]/` (read-only detail + edit + delete forms), and `_components/` (the optimistic list + the deleted-toast island). Each request-time page ships a sibling `loading.tsx` (the Suspense seam under `cacheComponents`).
- `src/components/ui/` — shadcn primitives (`button`, `badge`, `card`, `separator`, `skeleton`, `input`, `label`, `native-select`, `dialog`, `sonner`).
- `src/db/` — `index.ts` (the `db` client + Relations v1 wiring), `columns.ts`, `cursor.ts`, `schema.ts` (the six tables — the single source of truth), `relations.ts`, `queries/invoices.ts` (the org-scoped `listCustomers` read).
- `src/lib/` — `result.ts` (the `Result<T>` contract + `ok`/`err`/`isUniqueViolation`), `auth-stub.ts` (`getActiveContext` — a fixed org+user resolved by natural key), `utils.ts` (`cn`), and `invoices/` (`schema.ts` read-boundary Zod, `queries.ts` the two reads, `mutation-schemas.ts` the drizzle-zod write schemas, `actions.ts` the three Server Actions).
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
