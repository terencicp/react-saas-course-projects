# AGENTS.md

The routed customer wizard — an in-memory customers workspace with a four-step "new customer" wizard backed by a per-request Zustand store. One per-feature store (composed from four typed slices) owns the draft across four route segments under `/customers/new`; the provider is pinned on the shared segment layout, validity is derived per step, and the submit button calls a direct-input Server Action that re-parses the composite payload. No database, no auth: customers live in `src/server/store.ts` (a `globalThis`-backed singleton) and identity is the `acting-identity` cookie via `src/server/session.ts`.

## Daily commands

- `pnpm dev` — run the dev server (`/customers`, `/customers/new/step-1`, `/inspector`).
- `pnpm verify` — Biome CI + typegen + typecheck + build (the gate).
- `pnpm test:lesson <n>` — run a single lesson verification file.
