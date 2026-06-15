# AGENTS.md

The production list view — an in-memory invoices list-view workspace: URL-driven filter/sort/search/cursor state via `nuqs`, soft-delete and archive lifecycle with restore, and version-based optimistic concurrency on update. No database, no auth: invoices live in `src/server/store.ts` (a module singleton) and identity is the `acting-identity` cookie via `src/server/session.ts`.

## Daily commands

- `pnpm dev` — run the dev server (`/invoices` and `/inspector`).
- `pnpm verify` — Biome CI + typegen + typecheck + build (the gate).
- `pnpm test:lesson <n>` — run a single lesson verification file.
