This is the starting code repo for the chapter 067 project of the React SaaS course.

This repo builds on the previous projects: 028, 035, 041, 047, 050, 055, 059, 062.

You write exactly four files; everything else (schema, queries, inspector, REST
helpers, CSV/email/error/day-bucket libs, config, seed) is provided. The work is
marked with `TODO(L<n>)` — run `rg "TODO\(L" trigger src` to enumerate it:

- `trigger/export-invoices.ts` — the durable parent task (L2 boundary, L3 page loop,
  L4 closing email child + audit transaction).
- `trigger/paginate-page.ts` — the per-page child (L3).
- `trigger/send-export-email.ts` — the guarded email child (L4).
- `src/lib/exports/start.ts` — the `startExport` Server Action that fires the run (L2).

## Setup

1. `cp .env.example .env`.
2. `docker compose up -d` — start local Postgres 18.
3. `pnpm install`.
4. Fill in `.env`. The `TRIGGER_*` values can stay at their dummy placeholders for
   the seeded `/inspector` surface; replace them with real dashboard values to run a
   real export against the worker.
5. `pnpm db:migrate` then `pnpm db:seed`.
6. `pnpm dev` — open `/inspector`.

The Trigger.dev worker is not part of the build/render pipeline. The inspector renders
deterministically from the seeded `exports` table + audit tail; the live loop (real
run, kill-resume, email) is the lessons' by-hand checklist with `pnpm trigger:dev`.
