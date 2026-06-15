# Chapter 062 — The production list view (starting code)

This is the starting code repo for the chapter 062 project of the React SaaS course.

It turns a plain invoice list into a production list view: filter, sort, search,
and cursor pagination carried in the URL via `nuqs`; soft-delete and archive as
distinct lifecycle states with restore; and version-based optimistic concurrency
on update that surfaces an honest conflict instead of a silent overwrite.

Conceptually this continues the org/RBAC project line (chapter 059), but it ships
as a **fresh, self-contained scaffold** with no database and no auth: invoices
live in an in-memory module singleton (`src/server/store.ts`) and identity is the
`acting-identity` cookie (`src/server/session.ts`). Nothing to bring up — `pnpm
dev` renders `/invoices` and `/inspector` immediately.

## Commands

- `pnpm install` — install dependencies (pnpm only).
- `pnpm dev` — run the dev server (`/invoices` and `/inspector`).
- `pnpm verify` — Biome CI + typegen + typecheck + build (the gate).
- `pnpm test:lesson <n>` — run a single lesson verification file.

## Stack

React 19, Next.js 16 (App Router, Cache Components), TypeScript, Tailwind v4 +
shadcn/ui (Radix umbrella), Zod 4, `nuqs` for URL state, Biome, Vitest.
