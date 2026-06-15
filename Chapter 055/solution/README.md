# Chapter 055 — Email + password auth with verification

The canonical first auth flow, wired end-to-end on the carried-in invoicing/email
scaffold: configure the Better Auth `auth` instance, generate the four-table
Drizzle schema, mount the one catch-all handler, and ship sign-up → verification
email → click-to-verify → sign-in → protected `/dashboard` → sign-out.

No OAuth, passkeys, 2FA, magic links, or password reset — the project stays in
the email + password lane.

## Prerequisites

- Node 24, pnpm 11.3 (`engine-strict` is on; the `preinstall` guard blocks non-pnpm).
- Docker (for local Postgres 18).
- A [Resend](https://resend.com) account with a **verified sending domain** (see below).

## Setup

1. `cp .env.example .env`.
2. `docker compose up -d` — start local Postgres.
3. `pnpm install`.
4. Fill in `.env`. Generate the Better Auth secret with `openssl rand -base64 32`
   and paste it into `BETTER_AUTH_SECRET`; leave `BETTER_AUTH_URL=http://localhost:3000`.
5. `pnpm db:migrate` — apply the init migration (`email_suppressions` + enum).
6. `pnpm auth:generate` — write the four-table auth schema to
   `src/db/schema/auth.ts`, then `pnpm db:generate --name add_auth_tables` and
   `pnpm db:migrate` to create the `user`/`session`/`account`/`verification` tables.
   _(These tables are produced in Lesson 2 — until then the schema file is a stub.)_
7. Run both servers (see "Two servers").

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
| `RESEND_API_KEY` | From the Resend dashboard. Server-only. |
| `EMAIL_FROM` | Full `Name <addr>` header on your verified domain. |
| `EMAIL_REPLY_TO` | A monitored reply address. |
| `NEXT_PUBLIC_APP_NAME` | Public app name. |
| `NEXT_PUBLIC_APP_URL` | Public app origin. |

## Seeding

`pnpm db:seed` clears the suppression list and inserts no rows — users arrive
through sign-up. To exercise the resend escape-hatch (a suppressed recipient
that still lets verification mail through), insert one suppressed address by hand
in `scripts/seed.ts` before seeding.

## Two servers

The app and the email preview run side by side:

- `pnpm dev` — the Next app at <http://localhost:3000>. It opens on `/sign-in`.
- `pnpm email` — the React Email preview server at <http://localhost:3001>
  (`--dir ./src/emails`, `--port 3001` to avoid the dev-server clash).

Use the preview server when iterating on the verification template itself (live
reload, light/dark toggle, mobile reflow).

## Commands

See `AGENTS.md` for the full command list.
