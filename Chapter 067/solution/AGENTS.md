# AGENTS.md

Durable CSV export with Trigger.dev (built on the Chapter 059 org/RBAC/audit
backend; the Chapter 062 invoices read re-homed onto Drizzle; the Chapter 050 Resend
send path). A paginated CSV export of an org's invoices runs as a Trigger.dev v4
durable job, fired fire-and-forget from a Server Action and surviving a mid-run
worker kill.

The tenancy seam is unchanged: `requireOrgUser()` resolves `{ user, orgId, role }`
from the validated session, `tenantDb(orgId)` is the only scoped data facade, and
`authedAction(role, schema, fn)` is the only privileged Server Action shape. Inside a
Trigger.dev run there is NO request context — `organizationId`/`requestedBy` ride in
the validated payload and tenancy is re-derived via `tenantDb(organizationId)`. The
append-only `audit_logs` table (RLS deny UPDATE/DELETE) records the run's completion
in the same `tenantDb(orgId).transaction(…)` as the `exports`-row update, with
`logAudit` called in its explicit-context form (`actorUserId: null` — the task has no
session). The `/inspector` Server Component is the verification surface.

## The marquee constraint

**The Trigger.dev worker is NOT in the build/render pipeline.** The render pipeline
boots Docker Postgres + `db:migrate` + `db:seed` only — no cloud project, no worker,
no `TRIGGER_SECRET_KEY` round-trip (`.env` ships dummy `tr_dev_…`/`proj_…` values so
`next build`'s env check passes). The inspector renders deterministically from the
seeded `exports` table + audit tail, and ships a dev "Simulate run" debug (a direct
`exports` write — no Trigger.dev call) so the run-panel figures are reproducible. The
live loop needs the two-terminal CLI setup (`pnpm trigger:dev` + `pnpm dev`).

## Stack core (May 2026)

Next.js 16 (App Router, Cache Components, proxy) · React 19 · TypeScript · Tailwind
v4 · shadcn/ui · Zod 4 · Better Auth (Drizzle adapter + organization plugin) · Drizzle
ORM 0.45 (postgres-js) · Postgres 18 (Docker, RLS on `audit_logs`) · Resend · React
Email 6 · **Trigger.dev v4** (`@trigger.dev/sdk` + the `trigger.dev` CLI) · pino.

## Repo layout

- `trigger/` — root-level task folder, registered via `dirs: ['./trigger']` in
  `trigger.config.ts`: `export-invoices.ts` (the parent + module-scope `exportQueue`),
  `paginate-page.ts` (the per-page child), `send-export-email.ts` (the guarded email
  child). **Student-owned** (the three task files + `src/lib/exports/start.ts`).
- `trigger.config.ts` — `defineConfig({ project, dirs, runtime, maxDuration, retries })`.
  `maxDuration` is required in v4; queues are NOT a config field (module-scope only).
- `src/app/` — App Router. `(protected)/inspector/` is the verification surface:
  `page.tsx`, `loading.tsx`, `_data.ts`, `actions.ts` (dev-gated `simulateRun`/
  `resetExports`/`switchIdentity`), `_components/` (the export controls + run panel +
  debug controls + identity switcher islands). `api/exports/[runId]/route.ts` is the
  `runtime = 'nodejs'` poller reading `retrieveRun`. The `(auth)` + `(protected)/
  {dashboard,sign-out}` surfaces carry in from 059.
- `src/db/` — `schema.ts` (`email_suppressions` + `invoices` + `exports`),
  `schema/auth.ts`, `audit.ts` (`audit_logs` + RLS), `tenant.ts` (`withTenant` +
  `tenantDb`, extended with `invoices`/`exports` reads + `.transaction`), `audit-log.ts`
  (`logAudit` with the explicit-context overload), `queries/invoices.ts`
  (`listInvoices`/`countInvoices`), `queries/{members,invitations,audit}.ts`.
- `src/lib/exports/` — `to-csv.ts` (pure `rowsToCsv`), `errors.ts` (`ExportError`),
  `day-bucket.ts` (`dayBucket()`), `start.ts` (the `startExport` action — student-owned).
- `src/lib/trigger-client.ts` — `retrieveRun`/`listRunsForOrg` (REST reads, no log scrape).
- `src/emails/ExportReadyEmail.tsx` — the export-ready template.
- `src/env.ts` — the env boundary (+ the `TRIGGER_*`/`APP_URL` block).
- `scripts/seed.ts` — 3 orgs × 200+ invoices + 1 empty org + 1 completed `exports` row.

## Daily commands

- `docker compose up -d` — start local Postgres 18.
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:studio` — Drizzle.
- `pnpm dev` — the Next app.
- `pnpm trigger:dev` — the local Trigger.dev worker (live loop; needs a linked project).
- `pnpm trigger:deploy` — deploy the tasks to the cloud project.
- `pnpm email` — the React Email preview server (port 3001).
- `pnpm build` / `tsc --noEmit` / `pnpm check` — build / typecheck / Biome (writes).
- `pnpm verify` — Biome CI + typecheck + build (the gate; needs the env set).
- `pnpm test:lesson <n>` — run a single lesson test.

## Conventions

`schemaTask` validates a `z.strictObject` payload at the trigger edge, never the body.
The export queue is declared ONCE at module scope (`queue({ name: 'export',
concurrencyLimit: 1 })`); per-org isolation is `concurrencyKey: organizationId` at the
trigger call, never a dynamically-named queue. `tasks.trigger` fires from the action
(fire-and-forget); `triggerAndWait` is used only inside a task body (each a durable
checkpoint). Idempotency keys use `idempotencyKeys.create([...parts], { scope })`,
never hand-spliced strings: the business key is `scope: 'global'` + `idempotencyKeyTTL:
'24h'`; per-page/email keys default to `scope: 'run'`. `metadata.set` (the module-level
import, not a run-context field) is the live-progress channel. `AbortTaskRunError` is
for permanents only (empty resultset); transients throw and retry. Timestamps are plain
`Date` at the `timestamptz` boundary; `dayBucket()` is a `YYYY-MM-DD` string — no
Temporal. The payload `organizationId`/`requestedBy` use `z.string().min(1)` (the seed
assigns base62 ids, not UUIDs). No R2, no cache tags, no dispatcher, no
schedules/waitpoints/rate-limit.
