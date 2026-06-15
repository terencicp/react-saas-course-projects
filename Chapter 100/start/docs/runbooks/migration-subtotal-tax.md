# Migration log — split `total` into `subtotal` + `tax`

The expand-migrate-contract record for the money-column split. One section per PR;
each captures the migration file, what shipped, and the production run notes.

<!-- TODO(L3) — PR 1 (Expand): the additive `0005_expand_subtotal_tax` migration,
     the two nullable columns, and the "no app touch / no row rewrite" note. -->

<!-- TODO(L4) — PR 2 (Migrate): the dual-write, the `coalesce` dual-read, the
     by-hand `pnpm db:backfill` run against production (after the dual-write merges),
     and the `0006_set_subtotal_tax_not_null` promotion. -->

<!-- TODO(L5) — PR 3 (Contract): the `0007_contract_total` DROP COLUMN, the legacy
     reference cleanup, and the type-checker + scoped-grep nets. -->

## PR 1 — Expand

## PR 2 — Migrate

## PR 3 — Contract
