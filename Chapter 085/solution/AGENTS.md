# AGENTS.md

The tri-locale invoices list — the in-memory invoices list-view lifted into a locale-routed (`en-US`, `en-GB`, `fr-FR`), timezone-aware surface with a real i18n SEO shape. Locale is resolved once in `src/proxy.ts`; every UI string flows through next-intl's `t()`/catalogs, dates and money format on the `useFormatter`/`getFormatter` seam, and the marketing pages emit bidirectional `hreflang` + per-locale OG. No database, no auth: invoices live in `src/server/store.ts` (a module singleton seeding `Temporal.Instant`/`Temporal.PlainDate` rows) and identity is the `acting-identity` cookie via `src/server/session.ts`.

## Daily commands

- `pnpm dev` — run the dev server (`/[locale]/invoices`, the marketing pages, and `/inspector`).
- `pnpm verify` — Biome CI + typecheck + build (the gate).
- `pnpm test:lesson <n>` — run a single lesson verification file.
