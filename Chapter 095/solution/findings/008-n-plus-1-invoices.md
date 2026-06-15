# Finding 008 — N+1 in the dashboard invoice list: one query per invoice for its customer

**Category:** N+1 at the database layer (chapter 094, lesson 7).
**Severity:** medium — the data is correct and a single dashboard render is tolerable at seed scale, but the query count grows linearly with the invoice list and each round-trip holds a connection, so it degrades and risks pool exhaustion as the org grows. Medium, not high: no data is lost and the fix is a one-statement rewrite, but it is a latency cliff that gets worse with real data.

## Rule

Reading a parent list and then fetching each row's related record in a loop is the N+1 anti-pattern: it issues 1 query for the list plus N queries for the relations, where the relations API would issue one (chapter 094, lesson 7 — `N+1 queries and the Drizzle relations API`). Drizzle relations v1 (`db.query.<table>.findMany({ with: { ... } })`) emits a single lateral-join statement — the old "the ORM secretly N+1s" fear does not apply here.

## Location

`src/db/queries/invoices-with-customer.ts`, lines 22–48 — `listInvoicesWithCustomer` runs one `db.select().from(invoices)` for the org's rows, then **loops** over them firing a separate `db.select().from(customers)` per invoice (`for (const invoice of rows) { … }`). This is the dedicated dashboard helper; the healthy `src/db/queries/invoices.ts` (`listInvoices`) already uses the relations API and stays healthy — the N+1 lives only in this file.

How it surfaced — the diagnostic surface is the query log, confirmed with `.toSQL()`. A DevTools/Sentry trace of the `/dashboard` render shows **1 + N** database spans — one invoice select followed by a fan of identical single-row customer selects, one per invoice. Confirm by dumping the loop's statement:

```ts
console.log(
  db.select().from(customers).where(eq(customers.id, id)).toSQL(),
);
```

`.toSQL()` prints one `select … from customers where id = $1` per call — N of them — against the single invoice select. With the seeded ≥30 invoices that is 31 statements where 1 is reachable.

## Consequence

The render fires **1 + N** queries — 31 with the seeded data, growing one-for-one with the invoice count. Each is a separate network round-trip that holds a pooled connection for its duration, so the dashboard accumulates roughly 50ms of avoidable latency at seed scale and far more as the list grows, and under concurrent loads the fan of per-invoice queries is a connection-pool exhaustion risk (every in-flight dashboard render checks out a connection per invoice). Operator-visible: a slow dashboard that gets slower as the customer base grows, with a query count that scales with the data instead of staying flat.

## Fix

Documented, not patched — the helper keeps the loop so the N+1 stays readable in a trace. The senior reach is the relations API, which collapses the 1 + N into one statement:

```ts
const rows = await db.query.invoices.findMany({
  where: eq(invoices.organizationId, orgId),
  orderBy: desc(invoices.createdAt),
  limit,
  with: { customer: true },
});
```

The `invoicesRelations` declaration in `src/db/schema.ts` (`customer: one(customers, …)`) is already in place, so `with: { customer: true }` expands the customer onto each invoice in a **single lateral-join statement** — verify with `.toSQL()` (one `select … left join lateral …`, not N selects). This drops the query count from `1 + N` to `1`, flat regardless of list size.

Half-credit hand-writes an `innerJoin`/`leftJoin` in the core query builder (it removes the N+1 but reintroduces manual row-shaping the relations API does for free); full credit uses `findMany({ with: { customer: true } })` and verifies the single statement with `.toSQL()`.
