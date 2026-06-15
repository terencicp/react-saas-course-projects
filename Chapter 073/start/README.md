# Chapter 073 — Caching the invoices list (starting code)

This is the starting code repo for the chapter 073 project of the React SaaS course.

It layers Next.js 16 tag-driven caching onto the chapter-062 invoices list: three
reads (`listInvoices`, `getOrgInvoiceSummary`, `getInvoiceDetail`) opt into
`'use cache'`, a single `tags.ts` source of truth issues namespaced tags, lifecycle
actions fan `updateTag` out for read-your-writes, and an in-process summary job uses
`revalidateTag(tag, 'max')` for eventual invalidation. Every cache decision is read
off the server-rendered `fetchedAt` strip and the `/inspector` panels.

This repo builds on the previous projects: 062 (and conceptually the line behind it:
028, 035, 041, 047, 050, 055, 059). It ships as a **fresh, self-contained scaffold**
with no database and no auth: invoices live in an in-memory module singleton
(`src/server/store.ts`) and identity is the `acting-identity` cookie
(`src/server/session.ts`). Nothing to bring up — `pnpm dev` renders `/invoices` and
`/inspector` immediately.

## Commands

- `pnpm install` — install dependencies (pnpm only).
- `pnpm dev` — run the dev server (`/invoices` and `/inspector`).
- `pnpm verify` — Biome CI + typegen + typecheck + build (the gate).
- `pnpm test:lesson <n>` — run a single lesson verification file.

## Stack

React 19, Next.js 16 (App Router, Cache Components), TypeScript, Tailwind v4 +
shadcn/ui (Radix umbrella), Zod 4, `nuqs` for URL state, Biome, Vitest.
