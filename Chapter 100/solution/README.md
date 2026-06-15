# Chapter 100 — Ship to production, then live-migrate the schema

A live, org-scoped invoices app whose `invoices` table carries a single combined
`total numeric(12,2) NOT NULL` — a real anti-pattern. The project evolves it into
separate `subtotal` + `tax` columns through the **expand-migrate-contract** cadence:
three reviewed migrations run against a real Postgres, with the running app and the
live schema never incompatible.

## Setup

```bash
npx degit <repo> chapter-100
cd chapter-100
pnpm install
docker compose up -d            # Postgres 18
cp .env.example .env
pnpm db:migrate && pnpm db:seed
pnpm dev                        # http://localhost:3000
```

- `/invoices` — the carried-in list (URL-state filters, lifecycle badges, the
  `version`-precondition edit + conflict UI).
- `/inspector` — the migration verification surface: schema-state probe,
  split-coverage, dual-write rows, the data-integrity diff, the audit tail, the
  deployment-environment + build-source indicators, and the `/api/health` link.

## The three-PR migration plan

| PR | Migration | What it does |
| -- | --------- | ------------ |
| 1 — Expand | `0005_expand_subtotal_tax` | add **nullable** `subtotal` + `tax` (additive-only; no app touch, no row rewrite) |
| 2 — Migrate | `0006_set_subtotal_tax_not_null` | dual-write all three columns, `coalesce` dual-read, run `pnpm db:backfill`, then promote to `NOT NULL` |
| 3 — Contract | `0007_contract_total` | `DROP COLUMN total`, strip every legacy reference (the one irreversible move) |

The backfill is a by-hand script (`pnpm db:backfill`) run against the unpooled
connection — bounded, batched, idempotent, never imported by the app.

## Deploy and rollback

The deployment half is by-hand against live Vercel/Neon/GitHub/Sentry accounts. The
gestures and their evidence live in the runbooks:

- [`docs/runbooks/launch-checklist.md`](docs/runbooks/launch-checklist.md)
- [`docs/runbooks/migration-subtotal-tax.md`](docs/runbooks/migration-subtotal-tax.md)
- [`docs/runbooks/rollback.md`](docs/runbooks/rollback.md) — note the bolded caveat:
  **an alias re-point does not undo a forward-only migration.**

`solution/` makes no Vercel/Neon SDK call at runtime; the inspector reads
`VERCEL_ENV` / `VERCEL_GIT_COMMIT_SHA` only and renders a `development`/`local`
fallback off-Vercel.
