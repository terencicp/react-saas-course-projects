# AGENTS.md

TanStack Query on optimistic comments — a polling, infinite-scrolling, optimistically-added comment thread bolted onto the in-memory invoices app from the production list view. The invoice detail page (`/invoices/[id]`) carries the thread, scoped to a single `'use client'` leaf; the surrounding surface stays Server Components. No database, no auth: invoices and comments live in `src/server/store.ts` (a `globalThis`-backed singleton so the route-handler read seam and the Server Action write seam share one copy across the bundle split) and identity is the `acting-identity` cookie via `src/server/session.ts`.

The read side is `GET /api/invoices/[id]/comments` (a `useInfiniteQuery` with cursor paging, `maxPages: 10`, and 10s polling); the write side is `addCommentAction` (a direct-input Server Action driven by `useMutation` with the cache-update optimistic add). The two-system invalidation: the action's `updateTag` plus the client's `invalidateQueries`.

## Daily commands

- `pnpm dev` — run the dev server (`/invoices` and `/inspector`).
- `pnpm verify` — Biome CI + typegen + typecheck + build (the gate).
- `pnpm test:lesson <n>` — run a single lesson verification file.
