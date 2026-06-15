# Finding 010 — `invoices` has no composite `(org_id, created_at)` index; the dashboard read seq-scans and sorts in memory

**Category:** Missing database index — `EXPLAIN ANALYZE` + leftmost-prefix composite (chapter 094, lesson 7). Bonus finding — the senior reach above the 8/8 floor, on the same `/dashboard` read path as findings 005 and 008.
**Severity:** medium — the read returns correct rows and is tolerable at seed scale, but the planner scans every invoice row and sorts the result set in memory on each render, so latency grows with the table and memory pressure rises under concurrent loads. Medium, not high: no data is lost and the fix is one schema line plus a generated migration, but it is a latency cliff that worsens as the org's invoice history accumulates.

## Rule

A query that filters on one column and orders by another should be served by a composite index whose leftmost prefix matches the filter and whose next column matches the sort, so the planner reads the matching rows in already-sorted order instead of scanning the whole table and sorting in memory (chapter 094, lesson 7 — `Indexes and EXPLAIN ANALYZE`). The org-scoped, `createdAt`-ordered invoice read (`where organization_id = $1 order by created_at desc`) is exactly that shape, so it wants a `(organization_id, created_at)` index (with `id` appended to make the order total and the cursor stable) — the leftmost-prefix `org_id` serves the filter, `created_at` serves the sort.

## Location

- `src/db/schema.ts`, lines 84–101 — the `invoices` table ships with **only its primary key**: no third-argument index array, so there is no `(organization_id, created_at)` composite index (confirm with `rg -n "index\(.*organization_id.*created_at" src/db/schema.ts` — no match). Contrast `customers` (line 66) and `exports` (lines 157–164), which do declare their indexes.
- `src/db/queries/invoices-with-customer.ts`, lines 30–35 — the read this index serves: `where(eq(invoices.organizationId, orgId)).orderBy(desc(invoices.createdAt))`.

How it surfaced — the diagnostic surface is the query plan, read with `EXPLAIN ANALYZE`. Dump the plan for the dashboard read against the seeded data:

```sql
EXPLAIN ANALYZE
SELECT * FROM invoices
WHERE organization_id = '<seeded-org-id>'
ORDER BY created_at DESC
LIMIT 30;
```

The plan shows a **`Seq Scan on invoices`** (the planner reads every row, then filters) feeding a **`Sort` node** with a `Sort Method: quicksort  Memory:` line (the result set is ordered in memory because nothing arrives pre-sorted). Those two nodes are the fingerprint — a full scan plus an in-memory sort where an `Index Scan` over a matching composite index would read only the org's rows in order.

## Consequence

Every dashboard render scans the entire `invoices` table to find one org's rows, then sorts them in memory by `created_at`. At the seeded ≥30 rows the plan is cheap, but the scan cost grows linearly with the *whole table* (every org's invoices, not just the rendering org's) and the in-memory sort allocates `work_mem` per concurrent query — so as invoice history accumulates across all tenants, this read degrades for every org at once and adds memory pressure under load. Operator-visible: a query plan that gets slower as the product grows, paid on the first authenticated screen every signed-in user hits, compounding findings 005 (the read sits in the waterfall) and 008 (it is already firing 1 + N).

## Fix

Documented, not patched — the schema keeps the table index-less so `start/` and `solution/` ship identical Drizzle sets and the `EXPLAIN ANALYZE` Seq Scan stays readable for the lesson. The senior reach has two halves, and naming the first without the second is **half-credit**:

1. **Declare the composite index in `src/db/schema.ts`** — a third-argument index array on `invoices`, leftmost-prefix `organization_id`, then `created_at`, then `id` (so the order is total and the cursor is stable):

   ```ts
   export const invoices = pgTable(
     'invoices',
     {
       /* …columns… */
     },
     (t) => [
       index('idx_invoices_org_created').on(
         t.organizationId,
         t.createdAt,
         t.id,
       ),
     ],
   );
   ```

2. **Generate the migration with `drizzle-kit`** — `pnpm db:generate --name index_invoices_org_created` emits the `CREATE INDEX` migration into `drizzle/`, then `pnpm db:migrate` applies it. This is the load-bearing second half: declaring the index in the schema changes nothing in the database until the migration runs. (The answer key describes this as a by-hand student step and does **not** commit the migration — this is bonus evidence, not a shipped patch. It uses the Unit-5 migration mechanics the student already has, **not** the expand-migrate-contract workflow, which is chapter 100.)

Re-run the `EXPLAIN ANALYZE` after the migration: the `Seq Scan` + `Sort` collapses to an **`Index Scan using idx_invoices_org_created`** (the rows arrive filtered and pre-sorted, no in-memory sort node). The query itself is **not rewritten** — the same Drizzle read now hits the index. Full credit names the leftmost-prefix composite *and* the generated migration *and* verifies the plan flip with `EXPLAIN ANALYZE`; naming the index without generating the migration is half-credit.
