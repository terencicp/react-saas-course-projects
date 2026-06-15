# Chapter 050 — The welcome email send path

One real transactional send, wired end-to-end: a suppression-gated, idempotency-keyed `sendEmail` seam, a pure props-only React Email template, and a five-seam Server Action the inspector page fires.

## Prerequisites

- Node 24, pnpm 11.3 (`engine-strict` is on; the `preinstall` guard blocks non-pnpm).
- Docker (for local Postgres 18).
- A [Resend](https://resend.com) account with a **verified sending domain** (see below).

## Setup

1. `cp .env.example .env` and fill in the values (see the env notes below).
2. `docker compose up -d` — start local Postgres.
3. `pnpm install`
4. `pnpm db:migrate` — apply the init migration.
5. Before seeding, replace the placeholder suppressed address (see "Seed placeholder").
6. `pnpm db:seed` — insert the org, user, and one suppressed row.
7. Run both servers (see "Two servers").

## Verified-domain ceremony (recap from Chapter 048)

A transactional `from` address must live on a domain you control and have **verified in Resend**, or mailbox providers will spam-folder or reject the message. The one-time ceremony:

1. In the Resend dashboard, add your sending domain (use a subdomain like `send.yourdomain.com` so a deliverability mistake never poisons your root domain's reputation).
2. Resend gives you DNS records. Add them at your DNS host.
3. Wait for propagation, then click **Verify** in Resend.

### DNS checklist

- **SPF** — a `TXT` record on the sending subdomain authorizing Resend's servers to send for you.
- **DKIM** — the `CNAME`/`TXT` record(s) Resend provides; these sign every message so receivers can confirm it was not tampered with.
- **DMARC** — a `TXT` record at `_dmarc.<domain>` (start with `p=none` to monitor, tighten to `quarantine`/`reject` once SPF + DKIM align).
- **MX / return-path** — the record Resend asks for so bounces route back to it.

`EMAIL_FROM` in your `.env` must use an address on this verified subdomain (e.g. `noreply@send.yourdomain.com`).

## Environment variables

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | Local Postgres; both point at the Docker DB. |
| `SEED` | Seed PRNG seed (default 1). |
| `RESEND_API_KEY` | From the Resend dashboard. Server-only. |
| `EMAIL_FROM` | Full `Name <addr>` header on your verified domain. |
| `EMAIL_REPLY_TO` | A monitored reply address. |
| `NEXT_PUBLIC_APP_NAME` | Read by the action for the subject. |
| `NEXT_PUBLIC_APP_URL` | Read by the action to build the placeholder `verifyUrl`. |

## Seed placeholder

`scripts/seed.ts` inserts one suppressed address: `suppressed@send.acme.example`. Replace it with `suppressed@send.<your-domain>` **before** running `pnpm db:seed`, so submitting that address in the inspector hits the suppression path against your real domain (Resend is never called — the wrapper short-circuits at the gate).

## Two servers

The app and the email preview run side by side:

- `pnpm dev` — the Next app at <http://localhost:3000>. Open `/inspector/send-welcome`.
- `pnpm email` — the React Email preview server at <http://localhost:3001> (`--dir ./src/emails`, `--port 3001` to avoid the dev-server clash).

The inspector page also renders the template in an iframe via `render(...)`, so you can see the email without leaving the app. Use the preview server when iterating on the template itself (live reload, light/dark toggle, mobile reflow).

## Commands

See `AGENTS.md` for the full command list.
