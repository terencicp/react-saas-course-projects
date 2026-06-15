# Chapter 059 — Org, RBAC, and invitations end-to-end

This is the starting code repo for the Chapter 059 project of the React SaaS course.

This repo builds on the previous project: Chapter 055 (email + password auth with
verification).

Turn the Chapter 055 single-user dashboard into a multi-tenant SaaS, wiring every
Unit 9 structural defense end-to-end on the carried-in auth + email scaffold:

- **Organizations** as the tenancy unit — `activeOrganizationId` on the session and
  a `requireOrgUser()` returning `{ user, orgId, role }`.
- **`tenantDb(orgId)`** as the only scoped data facade.
- **`authedAction(role, schema, fn)`** as the only privileged Server Action shape.
- An append-only **`audit_logs`** table the Postgres RLS policies protect (deny
  UPDATE/DELETE), written in the same `withTenant(orgId, …)` transaction as the work.
- A capability-bearing **invite URL** (32-byte token + HMAC signature, hashed at
  rest, mailed after commit) carrying a stranger from email to a seat.

The `/inspector` Server Component is the verification surface (members, role-change
selects rendered to every role, invite form, pending list, audit tail, raw-helpers).
It renders privileged controls to every identity on purpose — the server-side
refusal, not a client-side hide, is the observable defense.

No remove/leave/transfer, no teams, no fine-grained permissions, no billing/seat
gates, no rate limiting — the workflow stays minimal so the structural lessons land.

## Prerequisites

- Node 24, pnpm 11.3 (`engine-strict` is on; the `preinstall` guard blocks non-pnpm).
- Docker (for local Postgres 18).
- A [Resend](https://resend.com) account with a **verified sending domain** (see below).

## Setup

1. `cp .env.example .env`.
2. `docker compose up -d` — start local Postgres.
3. `pnpm install`.
4. Fill in `.env`. Generate the Better Auth secret with `openssl rand -base64 32`
   and paste it into `BETTER_AUTH_SECRET`; generate a **distinct** value the same
   way for `INVITATION_SIGNING_SECRET`. Leave the URLs at `http://localhost:3000`.
5. `pnpm db:migrate` — apply the init + auth-table migrations.
6. `pnpm auth:generate` — after adding the `organization()` plugin (Lesson 2),
   regenerate `src/db/schema/auth.ts` with `organization`/`member`/`invitation`,
   `session.activeOrganizationId`, and the `invitation.tokenHash`/`acceptedAt`
   columns; then `pnpm db:generate --name add_organization` and `pnpm db:migrate`.
7. The `audit_logs` work (Lesson 3) needs **three** migrations in order: a custom
   `create_app_role` (creates the `authenticated` RLS role — absent on vanilla
   Docker), `add_audit_logs` (the table + ENABLE RLS + the three policies), and a
   custom `force_audit_rls` (`ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY` —
   drizzle-kit emits ENABLE only).
8. The invitation pending-unique index (Lesson 5) is a custom migration
   (`add_invitation_pending_index`), **not** a schema-callback edit — a later
   `pnpm auth:generate` run would clobber a hand-added index in `auth.ts`.
9. `pnpm db:seed` — seed the orgs/users/invitation/audit fixtures (see Seeding).
10. Run both servers (see "Two servers").

## Verified-domain ceremony (recap from Chapter 048)

A transactional `from` address must live on a domain you control and have
**verified in Resend**, or mailbox providers will spam-folder or reject the
message. The one-time ceremony:

1. In the Resend dashboard, add your sending domain (use a subdomain like
   `send.yourdomain.com` so a deliverability mistake never poisons your root
   domain's reputation).
2. Resend gives you DNS records (SPF, DKIM, DMARC, return-path). Add them at your
   DNS host, wait for propagation, then click **Verify** in Resend.

`EMAIL_FROM` in your `.env` must use an address on this verified subdomain (e.g.
`verify@send.yourdomain.com`).

## Environment variables

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | Local Postgres; both point at the Docker DB. |
| `SEED` | Seed PRNG seed (default 1). |
| `BETTER_AUTH_SECRET` | Signs cookies/tokens. `openssl rand -base64 32`. Server-only. |
| `BETTER_AUTH_URL` | The app's origin (`http://localhost:3000` locally). |
| `INVITATION_SIGNING_SECRET` | HMAC key for the signed accept URL. **Distinct** from `BETTER_AUTH_SECRET`. `openssl rand -base64 32`. Server-only. |
| `RESEND_API_KEY` | From the Resend dashboard. Server-only. |
| `EMAIL_FROM` | Full `Name <addr>` header on your verified domain. |
| `EMAIL_REPLY_TO` | A monitored reply address. |
| `NEXT_PUBLIC_APP_NAME` | Public app name. |
| `NEXT_PUBLIC_APP_URL` | Public app origin — the base host for the signed accept URL. |

## Seeding

`pnpm db:seed` lays down a deterministic multi-tenant fixture: two orgs (Acme,
Globex), four users (Alice owner / Bob admin / Carol member of Acme, Dave owner of
Globex), one pending invitation in Acme (a fixed token whose canonical accept URL
the seed prints on run), and one seeded `member.role-changed` audit row so the
inspector's audit tail is non-empty at first paint. The seed runs as the superuser
`postgres` (`BYPASSRLS`), so the fixture audit insert clears the FORCE-RLS policy
without `withTenant`.

## Two servers

The app and the email preview run side by side:

- `pnpm dev` — the Next app at <http://localhost:3000>. It opens on `/sign-in`.
- `pnpm email` — the React Email preview server at <http://localhost:3001>
  (`--dir ./src/emails`, `--port 3001` to avoid the dev-server clash).

Use the preview server when iterating on the invite template itself (live reload,
light/dark toggle, mobile reflow).

## Commands

See `AGENTS.md` for the full command list.
