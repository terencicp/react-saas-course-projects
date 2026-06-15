# Chapter 085 — The tri-locale invoices list (starting code)

This is the starting code repo for the chapter 085 project of the React SaaS course.

It lifts the chapter-062 invoices list into a tri-locale (`en-US`, `en-GB`,
`fr-FR`), timezone-aware surface and gives the marketing pages a real i18n SEO
shape: locale resolved once in `src/proxy.ts`, every UI string through next-intl's
`t()`/catalogs, dates and money on the `useFormatter`/`getFormatter` seam (the
viewer's profile `timeZone` and the invoice's own `currency`), and bidirectional
`hreflang` + per-locale OG on the marketing routes. The student-owned i18n/SEO
seams ship as compiling `TODO(L<n>)` stubs — `rg "TODO" src` enumerates the work.

Conceptually this continues the chapter-062 production list-view line (and the
projects behind it: 028, 035, 041, 047, 050, 055, 059), plus the Unit 17 teaching
chapters it consumes (083 time/dates/timezones, 084 internationalization). It ships
as a **fresh, self-contained scaffold** with no database and no auth: invoices live
in an in-memory module singleton (`src/server/store.ts`, seeding `Temporal.Instant`
/ `Temporal.PlainDate` rows) and identity is the `acting-identity` cookie
(`src/server/session.ts`). Nothing to bring up — `pnpm dev` renders `/[locale]/invoices`,
the marketing pages, and `/inspector` immediately.

## Commands

- `pnpm install` — install dependencies (pnpm only).
- `pnpm dev` — run the dev server (`/[locale]/invoices`, the marketing pages, and `/inspector`).
- `pnpm verify` — Biome CI + typecheck + build (the gate).
- `pnpm test:lesson <n>` — run a single lesson verification file.

## Stack

React 19, Next.js 16 (App Router, Cache Components), TypeScript, Tailwind v4 +
shadcn/ui (Radix umbrella), Zod 4, `nuqs` for URL state, `next-intl` for
localization, `temporal-polyfill` for Temporal, Biome, Vitest.
