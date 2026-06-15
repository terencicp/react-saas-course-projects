# AGENTS.md

A list-plus-detail invoicing workspace — the App Router surface project: parallel routes (`@list` / `@detail`), URL-driven view state, and an intercepting modal, forked from the Chapter 028 toolchain.

## Stack core (May 2026)

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 (CSS-first) · shadcn/ui · next-themes · Zod 4.

## Repo layout

- `src/app/` — App Router: root `layout.tsx`, `page.tsx` (redirects to `/invoices`), `globals.css`, `_components/providers.tsx`; the `invoices/` segment holds the two-slot shell (`@list` / `@detail`) plus the intercepting (`(.)new`) and full-page (`new`) routes.
- `src/components/` — render components (`invoice-list`, `invoice-detail`, `invoice-form`, `status-filter`, `new-invoice-dialog`, `skeletons`); `src/components/ui/` holds shadcn primitives.
- `src/lib/invoices/` — `schema.ts` (types + Zod), `data.ts` (in-memory fixture), `queries.ts` (async reads); `src/lib/utils.ts` (`cn()`).
- `tests/lessons/` — one `Lesson <n>.test.ts` per implementation lesson; `scripts/test-lesson.mjs` runs one file.

## Daily commands

- `pnpm dev` — run the dev server.
- `pnpm build` — production build.
- `pnpm check` — Biome format + lint + organize imports (writes).
- `tsc --noEmit` — typecheck.
- `pnpm verify` — Biome CI + typecheck + build (the gate).
- `pnpm test:lesson <n>` — run a single lesson test.

## Conventions

Code style is enforced by `biome.json`; TypeScript strictness by `tsconfig.json`; editor settings by `.editorconfig`.
