This is the starting code repo for the chapter 069 project of the React SaaS course.

This repo builds on the previous projects: 028, 035, 041, 047, 050, 055, 059, 062, 067.

You write exactly six surfaces; everything else (`lib/r2.ts`, the key/error/soft-delete
helpers, the CORS/lifecycle scripts, the schema/tenant/seed, the inspector, the whole
Chapter 067 backend) is provided. The work is marked with `TODO(L<n>)` — run
`rg "TODO\(L" src trigger` to enumerate it:

- `src/lib/files/presigned-put.ts` — the `presignedPut` action that signs the PUT (L2).
- `src/lib/files/finalize.ts` — `finalizeUpload`: HEAD the object, then insert (L3).
- `src/db/queries/file-metadata.ts` — the tenant-scoped reads + fresh GET signer (L4).
- `src/app/files/upload-form.tsx` — the XHR upload form with the progress bar (L3).
- `src/app/files/page.tsx` — the `/files` list rendering fresh-per-render GETs (L3/L4).
- `trigger/export-invoices.ts` — the export retrofit's closing R2 write (L5).

## Setup

1. `cp .env.example .env`.
2. `docker compose up -d` — start local Postgres 18.
3. `pnpm install`.
4. Fill in `.env`. The `TRIGGER_*` and `R2_*` values can stay at their dummy
   placeholders for the seeded `/inspector` + `/files` surfaces; replace them with real
   values to run the live upload and export loops.
5. `pnpm db:migrate` then `pnpm db:seed`.
6. `pnpm dev` — open `/files` and `/inspector`.

R2 is not part of the build/render pipeline. The four R2 env vars ship dummy values so
`next build`'s env check passes and `getSignedUrl` (local HMAC, no R2 call) can sign
real-shaped URLs at render time. The live loop (a real browser PUT landing bytes, the
HEAD verifying size, a copied URL 403ing at expiry, the export emailing a working R2
link) is the lessons' by-hand checklist, which needs your own R2 bucket + `pnpm r2:cors`.
