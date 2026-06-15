# Finding 010 — `invoices` has no composite `(org_id, created_at)` index; the dashboard read seq-scans and sorts in memory

<!-- TODO(L7 — optional bonus) — document the missing composite index on invoices: rule (094 L7, leftmost-prefix composite + EXPLAIN ANALYZE), location (db/schema.ts) + EXPLAIN ANALYZE surface (Seq Scan + in-memory sort), consequence (latency cliff as the table grows), fix (declare (org_id, created_at, id) index + generate the migration with drizzle-kit) -->

**Category:**
**Severity:**

## Rule

## Location

## Consequence

## Fix
