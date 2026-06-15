# AGENTS.md

Ask-your-invoices — the Unit 22 capstone. An LLM-backed chat grafted onto the in-memory invoices list from Chapter 062. The `/invoices` right rail hosts a typed `useChat` surface that answers questions about the seeded invoices by calling a single org-scoped tool; `/inspector` is the verification substrate for the quota, the audit tail, and the failure-mode toggles. No database, no auth wall, no external services to boot: invoices live in `src/server/store.ts` (a module singleton, read through `scopedInvoices(orgId)`), identity is the `acting-identity` cookie via `src/server/session.ts`, and the quota/audit "tables" are store arrays.

## The `lib/llm` seam

`src/lib/llm/*` is the only doorway to the model. The two route handlers (`src/app/api/chat/route.ts`, `src/app/api/usage/route.ts`) and `invoice-chat.tsx` (for the `InvoiceUIMessage` type only) are its only importers — no Server Component imports the tools or the prompt. Every `lib/llm/*` module and `authed-route.ts` starts `import 'server-only'`. The model handle is a bare AI Gateway string (`chatModel = 'openai/gpt-5-mini'`); no provider package is installed. No test or rendered check makes a live model call — the streamed answer, the 429 refusal, the forged-orgId proof, and the step-ceiling demo are manual Moments of truth against a real `AI_GATEWAY_API_KEY` set in `.env`.

## Daily commands

- `pnpm dev` — run the dev server (`/invoices` the chat surface, `/inspector` the verification panels). No login, no key needed for the shell.
- `pnpm verify` — Biome CI + typecheck + build (the gate; env validation skipped on the build via `SKIP_ENV_VALIDATION=true`).
- `pnpm test:lesson <n>` — run a single lesson verification file.
