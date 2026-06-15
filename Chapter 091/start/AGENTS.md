# AGENTS.md

Chapter 091 tests the carried-in **Chapter 065 Stripe-webhook app** — the system under
test (SUT), carried in **byte-identical and never edited**. The deliverable is four test
files: three Vitest integration tests against the real `POST /api/webhooks/stripe`
handler (real test Postgres + per-test `withRollback` rollback, MSW for Resend, an SDK
stub for `subscriptions.retrieve`) and one Playwright money-path spec against a production
build. The test harness (`src/test/**`, `tests/e2e/{fixtures,auth.setup,helpers}`, both
configs, both DB scripts) ships provided; the four `tests/{integration,e2e}/*` files are
`TODO` stubs the lessons fill.

The SUT below is the Chapter 065 description, unchanged.

## System under test (Chapter 065)

Stripe webhook → plan entitlement, on the carried-in Chapter 059 org/RBAC/audit
backend. The webhook (`app/api/webhooks/stripe/route.ts`) verifies → claims →
mutates in one `db.transaction`, projecting three subscription events onto the
single-writer `plan_entitlements` row; `lib/billing/` is the only Stripe importer,
exposing `upgrade` / `openPortal` / `requirePlan`. The carried-in tenancy seam is
unchanged: the Better Auth `auth` instance (`lib/auth.ts`) with the `organization()`
plugin — `requireOrgUser()` resolves `{ user, orgId, role }` from the
validated session, `tenantDb(orgId)` is the only scoped data facade, and
`authedAction(role, schema, fn)` is the only privileged Server Action shape. An
append-only `audit_logs` table (RLS deny UPDATE/DELETE) records mutations in the
same `withTenant(orgId, …)` transaction as the work. A signed, hashed invite URL
carries a stranger from email to a seat. The `/inspector` Server Component is the
verification surface; it renders privileged controls to every identity on purpose.

No remove/leave/transfer, no teams, no fine-grained permissions, no billing/seat
gates, no rate limiting, no background jobs.

## Stack core (May 2026)

Next.js 16 (App Router, Cache Components, proxy) · React 19 · TypeScript · Tailwind
v4 (CSS-first) · shadcn/ui · next-themes · Zod 4 · Better Auth (Drizzle adapter +
organization plugin) · Drizzle ORM 0.45 (postgres-js driver) · Postgres 18 (Docker,
RLS on `audit_logs`) · Resend · React Email 6 · sonner · Web Crypto (HMAC + SHA-256).

## Repo layout

- `src/app/` — App Router: root `layout.tsx`, `page.tsx` (redirects to `/sign-in`),
  `globals.css`, `_components/` (providers, `SubmitButton`, `FieldError`). `(auth)/`
  holds `sign-up`, `sign-in`, `verify-email`, and `accept-invite/` (the verify-ladder
  page + accept-form island). `(protected)/` holds the gated `layout.tsx`,
  `dashboard/` (+ `org-switcher.tsx`), `inspector/` (the verification surface:
  `page.tsx`, `loading.tsx`, `actions.ts`, `_components/`), and `sign-out-action.ts`.
  `onboarding/create-org/` is the no-active-org landing. `api/auth/[...all]/route.ts`
  is the one catch-all handler — the only route file.
- `src/proxy.ts` — the request-time gate (sibling of `app/`): cookie-presence only,
  never an authz decision.
- `src/components/ui/` — shadcn primitives (incl. `select` for the role control).
- `src/db/` — `index.ts` (the `db` client + `Transaction` type), `columns.ts`,
  `schema.ts` (`email_suppressions`), `schema/auth.ts` (the CLI-generated
  org-extended tables), `audit.ts` (`audit_logs` + RLS), `tenant.ts`
  (`withTenant` + `tenantDb`), `audit-log.ts` (`logAudit`), `queries/`
  (tenant-scoped reads).
- `src/emails/` — `welcome-verification.tsx`, `invite.tsx`, `email-tailwind-config.ts`,
  `components/email-layout.tsx`. Pure renderers — no env/DB reads.
- `src/lib/` — `auth.ts` (the `auth` instance + ladder + `requireOrgUser`),
  `auth-schema.config.ts` (CLI-only generator config), `auth-client.ts`
  (`organizationClient()` registered), `auth/roles.ts`, `auth/authed-action.ts`,
  `auth/error-mapping.ts`, `invitations/{url,send,accept,manage}.ts`, `redirects.ts`,
  `result.ts`, `suppressions.ts`, `email.ts`, `utils.ts`.
- `src/env.ts` — the only env boundary (`@t3-oss/env-nextjs`).
- `scripts/seed.ts` — the deterministic multi-tenant seed; `scripts/test-lesson.mjs`
  runs one lesson gate. `scripts/test-db-setup.ts` creates+migrates `saas_int_test`;
  `scripts/e2e-db-reset.ts` resets+migrates+seeds `saas_e2e` (via `scripts/seed-e2e.ts`).
- `src/test/` — the integration harness (provided): `integration-setup.ts` (loads
  `.env.test`, wires the `@/db` Proxy mock + the `@/lib/billing/stripe` SDK stub + the MSW
  lifecycle), `db/{worker-db,with-rollback}.ts`, `fixtures/{auth,stripe-events,stripe-subscription}.ts`,
  `msw/{server,handlers/resend}.ts`, `helpers/post-webhook.ts`, `stripe-retrieve-registry.ts`,
  `empty-module.ts`, `load-test-env.ts`. `src/db/test-tx-context.ts` (the ALS that threads
  the rollback tx) is harness-only too.
- `tests/integration/` — three `*.int.test.ts` (student). `tests/e2e/` — the money-path
  `*.spec.ts` (student) + provided `fixtures.ts`, `auth.setup.ts`, `helpers/fill-stripe-card.ts`.
- `lesson-verification/` — one `Lesson <n>.ts` source-shape gate per lesson.

## Daily commands

- `docker compose up -d` — start local Postgres 18.
- `pnpm auth:generate` — generate the org-extended auth Drizzle schema (CLI config
  is `src/lib/auth-schema.config.ts`, NOT `lib/auth.ts`).
- `pnpm db:generate` — generate a migration from the schema (pass `--name <verb>_<noun>`;
  `--custom` for the create-role / force-RLS / pending-index migrations).
- `pnpm db:migrate` — apply migrations to the local DB.
- `pnpm db:seed` — run the deterministic seed (orgs/users + one `free` entitlement row per org).
- `pnpm seed:stripe` — create the pro/team Products + Prices in test-mode Stripe and rewrite `catalog.json` (talks to Stripe, not the DB).
- `pnpm stripe:listen` — forward Stripe events to the local webhook and print the `whsec_…` signing secret.
- `pnpm db:studio` — open Drizzle Studio.
- `pnpm dev` — run the dev server.
- `pnpm email` — run the React Email preview server on port 3001 (`--dir ./src/emails`).
- `pnpm build` — production build.
- `pnpm check` — Biome format + lint + organize imports (writes).
- `tsc --noEmit` — typecheck.
- `pnpm verify` — Biome CI + typecheck + build (the gate; needs the env set).
- `pnpm test:lesson <n>` — run a single lesson gate (`lesson-verification/Lesson <n>.ts`).
- `pnpm db:test:setup` — create + migrate the integration DB `saas_int_test`.
- `pnpm test:integration` — run the Vitest integration suite (needs the test Postgres up;
  no live Stripe). `pnpm test:integration:watch` for watch mode.
- `pnpm db:e2e:reset` — create + migrate + seed the Playwright DB `saas_e2e`.
- `pnpm exec playwright install chromium` — one-time browser fetch (bring-up step).
- `pnpm test:e2e` — run the Playwright money-path spec on the port-3001 production build
  (needs `.env.test.local` with a real test-mode `STRIPE_SECRET_KEY` + `stripe listen`).

## Conventions

Code style is enforced by `biome.json`; TypeScript strictness by `tsconfig.json`.
`organization()` goes BEFORE `nextCookies()` in `plugins` (nextCookies last). The
proxy gates on cookie presence only; `requireOrgUser` reads the role fresh from the
membership row (`getActiveMember`), never a query param. `tenantDb`/`withTenant` are
the only scoped data paths; `tenantDb` does NOT set `app.org_id` — the audit-bearing
`withTenant` transaction does. `authedAction` is the only privileged action shape
(four fixed-order steps; refusals return a `Result`, never throw). Member/invitation
mutations go through `tx` directly, never `auth.api.*` (the lone exception is
`auth.api.setActiveOrganization` in `acceptInvitation`). RLS is wired only on
`audit_logs` (enabled AND forced). The accept URL is a capability: 32-byte token,
`sha256` at rest, HMAC over `id.token`, send-after-commit. Email templates are pure
renderers — no env/DB/session reads.
