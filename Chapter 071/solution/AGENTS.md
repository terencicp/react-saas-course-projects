# AGENTS.md

The notification dispatcher, on the carried-in Chapter 065 org/RBAC/audit/billing
backend. A single `dispatch(event)` entry point (`lib/notifications/`) is the one seam
channel knowledge lives in: call sites build a typed `NotificationEvent` and
`await dispatch(...)`, never importing `sendEmail` or writing `notifications` directly.
The `notifiableEvents` registry (`as const satisfies Record<string, NotifiableEvent>`)
is the source of truth; a batched, default-on (`?? true`) preference read with a
critical-channel override resolves channels; a 60-second Postgres dedup window keyed
`(eventType, dedupKey, recipientUserId)` collapses a burst to one; two uniform channels
(`sendEmailChannel`, `writeInboxChannel`) each run behind their own `try/catch`. The
three call sites (invite, role-change, billing webhook) dispatch only **after** their
transaction commits.

The carried tenancy/billing seam is unchanged: the Better Auth `auth` instance with the
`organization()` plugin — `requireOrgUser()` resolves `{ user, orgId, role }`,
`tenantDb(orgId)` is the only scoped data facade, `authedAction(role, schema, fn)` is
the only privileged action shape, `audit_logs` (RLS deny UPDATE/DELETE) records
mutations in the same `withTenant` transaction, the Stripe webhook verifies → claims →
mutates in one `db.transaction`, and `lib/billing/` is the only Stripe importer. The
`/inspector` Server Component is the verification surface; `/inbox` is the live inbox
read.

No coalesce/digest, quiet hours, push delivery, Redis dedup, durable queues, or
unsubscribe tokens (opt-out is the per-category preference toggle, full stop). The
notification surfaces are not cached.

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
  `schema.ts` (`email_suppressions`, `processed_events`, `plan_entitlements`, plus the
  three notification tables as a commented `// TODO(L2)` block the student uncomments in
  S1), `schema/auth.ts` (the CLI-generated org-extended tables), `audit.ts`
  (`audit_logs` + RLS), `tenant.ts` (`withTenant` + `tenantDb`), `audit-log.ts`
  (`logAudit`), `queries/` (tenant-scoped reads).
- `src/emails/` — `welcome-verification.tsx`, `invite.tsx`, plus the three notification
  templates `InviteSentEmail.tsx` / `RoleChangedEmail.tsx` / `BillingPastDueEmail.tsx`,
  `email-tailwind-config.ts`, `components/email-layout.tsx`. Pure renderers — no env/DB
  reads, no unsubscribe footer.
- `src/lib/notifications/` — the dispatcher module: `index.ts` (the barrel: `dispatch` +
  public types), `dispatcher.ts`, `registry.ts` (`notifiableEvents` + `EventType`),
  `dedup.ts`, `prefs.ts`, `channels/{email,inbox}.ts`, plus the provided `types.ts`,
  `errors.ts` (`NotificationError`), `get-user-email.ts`. Every internal module starts
  with `import 'server-only'`.
- `src/lib/` — `auth.ts` (the `auth` instance + ladder + `requireOrgUser`),
  `auth-schema.config.ts` (CLI-only generator config), `auth-client.ts`
  (`organizationClient()` registered), `auth/roles.ts`, `auth/authed-action.ts`,
  `auth/error-mapping.ts`, `billing/**` (the only Stripe importer),
  `webhooks/{processed-events,stripe}.ts`, `invitations/{url,send,accept,manage}.ts`,
  `redirects.ts`, `result.ts`, `suppressions.ts`, `email.ts` (+ the inspector email
  mock), `logger.ts`, `problem.ts`, `utils.ts`.
- `src/env.ts` — the only env boundary (`@t3-oss/env-nextjs`); `EMAIL_MOCK` (default
  `'1'`) short-circuits `sendEmail` before Resend for the inspector's deterministic
  email-sent counter.
- `scripts/seed.ts` — the deterministic multi-tenant seed; `scripts/test-lesson.mjs`
  runs one lesson test.
- `tests/lessons/` — one `Lesson <n>.test.ts` per implementation lesson.

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
- `pnpm test:lesson <n>` — run a single lesson test.

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
