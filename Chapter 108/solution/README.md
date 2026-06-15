# Chapter 108 — Ask-your-invoices chat with tool calling

The Unit 22 capstone: an LLM-backed chat grafted onto the in-memory invoices
list from Chapter 062. `/invoices` is the chat surface — its right rail hosts a
typed `useChat` panel that answers questions about the seeded invoices by calling
a single org-scoped tool. `/inspector` is the verification substrate for the
daily quota, the audit tail, and the failure-mode toggles.

## Setup

```sh
pnpm install
pnpm dev            # /invoices and /inspector — no login, no key needed for the shell
```

The app boots with no database, no auth wall, and no external services. Invoices
live in `src/server/store.ts` (a module singleton read through
`scopedInvoices(orgId)`); identity is the `acting-identity` cookie
(`src/server/session.ts`, default `org-acme:admin`); the quota and audit "tables"
are store arrays.

## The live model (manual checks only)

The streamed answer, the 429 refusal, the forged-orgId proof, and the
step-ceiling demo are **manual Moments of truth** — they need a real key. Copy
`.env.example` to `.env` and set `AI_GATEWAY_API_KEY` (from the Vercel AI Gateway
dashboard). No test, build, or rendered check makes a live model call, so
`pnpm verify` is green without a key.

## Commands

- `pnpm verify` — Biome CI + typecheck + build (the gate).
- `pnpm test:lesson <n>` — run a single lesson verification file.
