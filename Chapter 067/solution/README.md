# Chapter 067 — Durable CSV export with Trigger.dev

Build the canonical Trigger.dev v4 durable-job shape on the carried-in org/RBAC/
audit backend: a paginated CSV export of an org's invoices, fired fire-and-forget
from a Server Action and surviving a mid-run worker kill.

The six "make the wrong shape impossible" primitives:

1. **The trigger boundary** — `schemaTask` validates a `z.strictObject` payload at
   the trigger edge (never inside the body). A task has no request context, so
   `organizationId`/`requestedBy` travel as payload cargo and tenancy is re-derived
   via `tenantDb(organizationId)` inside the run.
2. **Multi-tenant back-pressure** — one predeclared `queue({ name, concurrencyLimit:
   1 })` at module scope plus `concurrencyKey: organizationId` at the trigger call:
   serial within an org, parallel across orgs (the v4-native shape).
3. **Durability at the seam** — each page is its own `paginatePage` child via
   `triggerAndWait`; every `triggerAndWait` is a checkpoint, so a crash between pages
   resumes at the next uncompleted page when the parent re-issues the same per-page
   idempotency keys.
4. **Two-scope idempotency** — a business key
   `idempotencyKeys.create([orgId, userId, dayBucket()], { scope: 'global' })` dedupes
   a same-day re-trigger at the action; per-step `idempotencyKeys.create([orgId,
   'page', String(page)])` keys make completed children return cached on retry.
5. **Live progress** — the parent writes `metadata.set('pagesTotal'/'pagesDone')` and
   the inspector reads run state structurally via the Trigger.dev REST API, never log
   strings.
6. **Guarded side effects** — the ready-email is its own `triggerAndWait` child keyed
   by `[orgId, 'export-email']`; the run closes by updating the `exports` row and
   writing one `export.invoices.completed` audit entry in a single `tenantDb`
   transaction. `AbortTaskRunError` is reserved for the permanent empty-resultset case.

You write only the three task files and `startExport`; the inspector, seed, REST-read
helpers, CSV/email/error/day-bucket libs, schema, and config are provided.

## What is NOT live in the build/render pipeline

**The Trigger.dev worker is not in the build/render pipeline** (the marquee
constraint, parallel to Chapter 065's Stripe CLI). The render pipeline boots Docker
Postgres + `db:migrate` + `db:seed` only — no Trigger.dev cloud project, no
`TRIGGER_SECRET_KEY` round-trip, no local worker. The `.env` ships dummy `tr_dev_…`/
`proj_…` values so `next build`'s env check passes.

The inspector renders **deterministically** from the seeded `exports` table + audit
tail, and ships a dev **"Simulate run"** debug (writes an `exports` row directly to a
chosen state — no Trigger.dev call) so the run-panel figures are reproducible. The
live loop (click Export → real run progresses → kill-resume → email arrives) is the
lessons' by-hand checklist, which needs the two-terminal CLI setup below.

## Prerequisites

- Node 24, pnpm 11.3 (`engine-strict` is on; the `preinstall` guard blocks non-pnpm).
- Docker (for local Postgres 18).
- A [Resend](https://resend.com) account with a verified sending domain.
- For the live loop only: a [Trigger.dev](https://trigger.dev) account + a linked
  cloud project (`npx trigger.dev@latest init`).

## Setup

1. `cp .env.example .env`.
2. `docker compose up -d` — start local Postgres.
3. `pnpm install`.
4. Fill in `.env`. Generate the Better Auth secret with `openssl rand -base64 32`;
   generate a distinct value for `INVITATION_SIGNING_SECRET`. The `TRIGGER_*` values
   can stay at their dummy placeholders for the rendered/seeded surface; replace them
   with real dashboard values to run the worker.
5. `pnpm db:migrate` — apply the migration set (auth + audit + invoices + exports).
6. `pnpm db:seed` — three orgs × 200+ invoices, one empty org (the `EMPTY_RESULTSET`
   target), and one completed `exports` row + matching audit row for the active org.
7. `pnpm dev` — the app at <http://localhost:3000>; open `/inspector`.

## The live loop (two terminals)

To run a real export end-to-end:

1. `npx trigger.dev@latest init` once to link a cloud project and write the project
   ref into `.env` (`TRIGGER_PROJECT_REF`) + paste the dashboard secret key
   (`TRIGGER_SECRET_KEY`). **Deploy/run Trigger before the app** — the task identity
   must exist before the app triggers it.
2. Terminal 1: `pnpm trigger:dev` — the local worker.
3. Terminal 2: `pnpm dev` — the Next app.
4. Click **Export invoices** on `/inspector`: the run progresses, the progress bar
   advances across pages, killing the worker mid-run resumes from the next page, and
   the `ExportReadyEmail` arrives.

## Environment variables

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | Local Postgres; both point at the Docker DB. |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` | Better Auth cookie signing + origin. |
| `INVITATION_SIGNING_SECRET` | HMAC key for the signed accept URL. Distinct from the auth secret. |
| `RESEND_API_KEY` / `EMAIL_FROM` / `EMAIL_REPLY_TO` | Resend send path. |
| `TRIGGER_SECRET_KEY` | `tr_…` SDK token. Dummy `tr_dev_…` for the seeded surface; real for the worker. |
| `TRIGGER_PROJECT_REF` | `proj_…` ref `trigger.config.ts` pins. |
| `APP_URL` | The app origin the task body reads for the download link base. |
| `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_APP_URL` | Public app identity. |

## Commands

See `AGENTS.md` for the full command list, including `pnpm trigger:dev` /
`pnpm trigger:deploy`.
