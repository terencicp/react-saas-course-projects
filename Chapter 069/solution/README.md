# Chapter 069 — Presigned R2 upload

Build the canonical browser-to-R2 upload surface on the carried-in org/RBAC/audit/
Trigger.dev backend, plus the Chapter 067 export retrofit: cash in the Chapter 068 R2
primitives as one runnable feature.

The seven "make the wrong shape impossible" primitives:

1. **The function is never a byte pipe** — `presignedPut` signs a direct-to-R2
   `PutObjectCommand`, so the multi-MB body goes straight to the virtual-hosted R2 host
   while only small JSON crosses the action.
2. **The two-step write** — sign → browser PUT → `finalizeUpload` HEADs the object → row
   insert, never row-before-bytes, so a never-completed upload leaves no orphan row.
3. **Server-observed identity over client claims** — `byteSize`/`contentType` come from
   the post-upload `HeadObjectCommand`, never the client's claim (the layered size
   defense; R2 does not enforce the signed `ContentLength`, so the HEAD is the real
   boundary).
4. **Server-constructed object keys** — `objectKey = org/${orgId}/files/${uploadId}.${ext}`
   is built from the org and a server-generated UUIDv7, never anything the client sends.
5. **Fresh-per-render presigned GETs** — `/files` mints a new short-lived GET per row per
   render and never persists or caches it, so a copied URL dies at expiry while a refresh
   re-issues a working one.
6. **Tenancy at every read** — every download/list read goes through `tenantDb(orgId)`
   filtered to non-deleted rows, so one org never sees another's files.
7. **One mechanism, two consumers** — one `lib/r2.ts` client powers both the browser-PUT
   user uploads and the server-PUT export retrofit (a worker with the CSV in memory PUTs
   directly — presigning back to itself is ceremony).

You write six surfaces — `presignedPut`, the `file_metadata` migration, `finalizeUpload`,
the XHR upload form, the fresh-GET list query + `/files` page, and the export retrofit.
`lib/r2.ts`, the key/error/soft-delete helpers, the CORS/lifecycle scripts, the inspector,
the seed, and the whole Chapter 067 backend are provided.

## What is NOT live in the build/render pipeline

**R2 is not in the build/render pipeline** (the marquee constraint, parallel to Chapter
067's Trigger.dev worker and 065's Stripe CLI). The render pipeline boots Docker Postgres
+ `db:migrate` + `db:seed` only — no R2 bucket, no live PUT/HEAD/GET round-trip, no
`pnpm r2:cors`/`r2:lifecycle` run. The four R2 env vars ship dummy values in `.env` so
`next build`'s env check passes and `getSignedUrl` (local HMAC, no R2 call) can sign
real-shaped URLs at render time.

The `/files` list renders **deterministically** from the seeded `file_metadata` rows with
locally-signed GET hrefs; the upload form renders its resting markup; the seeded
`completed` export renders on `/inspector` with its placeholder download URL. The live
loop (a real browser PUT landing bytes, the HEAD verifying size, a copied URL 403ing at
expiry, the export emailing a working R2 link) is the lessons' by-hand checklist, which
needs your own R2 bucket + `pnpm r2:cors`.

## Prerequisites

- Node 24, pnpm 11.3 (`engine-strict` is on; the `preinstall` guard blocks non-pnpm).
- Docker (for local Postgres 18).
- A [Resend](https://resend.com) account with a verified sending domain.
- For the live loops only: a [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket
  + a bucket-scoped Object Read+Write token; a [Trigger.dev](https://trigger.dev) account
  + a linked cloud project (`npx trigger.dev@latest init`).

## Setup

1. `cp .env.example .env`.
2. `docker compose up -d` — start local Postgres.
3. `pnpm install`.
4. Fill in `.env`. Generate the Better Auth secret with `openssl rand -base64 32`;
   generate a distinct value for `INVITATION_SIGNING_SECRET`. The `TRIGGER_*` and `R2_*`
   values can stay at their dummy placeholders for the rendered/seeded surface; replace
   them with real values to run the live loops.
5. `pnpm db:migrate` — apply the migration set (auth + audit + invoices + exports +
   file_metadata).
6. `pnpm db:seed` — three orgs × 200+ invoices, one empty org, one completed `exports` row
   + matching audit row, and 3 live + 1 soft-deleted `file_metadata` rows for `org_acme`.
7. `pnpm dev` — the app at <http://localhost:3000>; open `/files` and `/inspector`.

## The live upload loop (your own R2 bucket)

To run a real browser upload end-to-end:

1. Create an R2 bucket + a bucket-scoped Object Read+Write token in the Cloudflare
   dashboard. Paste `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET_NAME` into `.env`.
2. `pnpm r2:cors` — push the CORS rule (AllowedOrigins = `NEXT_PUBLIC_APP_URL`) the
   browser PUT needs.
3. `pnpm dev`, open `/files`, pick a file: it streams straight to R2 with a live progress
   bar, the HEAD verifies the true size/type, and the row appears with a working Download
   link. A copied link 403s after the 10-min GET expiry; a refresh re-issues a working one.

## The live export loop (two terminals + R2)

To run a real CSV export that emails a working R2 link:

1. `npx trigger.dev@latest init` once to link a cloud project; paste `TRIGGER_PROJECT_REF`
   + `TRIGGER_SECRET_KEY` into `.env`. R2 must be configured as above. **Deploy/run
   Trigger before the app.**
2. `pnpm r2:lifecycle` — push the 7-day expiry rule on the `exports/` prefix.
3. Terminal 1: `pnpm trigger:dev` — the local worker.
4. Terminal 2: `pnpm dev` — the Next app.
5. Click **Export invoices** on `/inspector`: the run PUTs the CSV under `exports/`, signs
   a real download link, and the `ExportReadyEmail` arrives with a working R2 URL.

## Environment variables

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | Local Postgres; both point at the Docker DB. |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` | Better Auth cookie signing + origin. |
| `INVITATION_SIGNING_SECRET` | HMAC key for the signed accept URL. Distinct from the auth secret. |
| `RESEND_API_KEY` / `EMAIL_FROM` / `EMAIL_REPLY_TO` | Resend send path. |
| `TRIGGER_SECRET_KEY` / `TRIGGER_PROJECT_REF` | Trigger.dev SDK token + project ref. Dummy for the seeded surface; real for the worker. |
| `APP_URL` | The app origin the task body reads; the `r2:lifecycle` script also reads it. |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` | Cloudflare R2 account + bucket-scoped token + bucket. Dummy for the seeded surface; real for the live loops. |
| `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_APP_URL` | Public app identity; `NEXT_PUBLIC_APP_URL` is also the R2 CORS AllowedOrigins value. |

## Commands

See `AGENTS.md` for the full command list, including `pnpm r2:cors` / `pnpm r2:lifecycle`
and `pnpm trigger:dev` / `pnpm trigger:deploy`.
