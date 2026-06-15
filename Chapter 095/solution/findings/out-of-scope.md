# Out of scope

Observations outside the eight audit categories — recorded, never scored as findings.

The discipline this file enforces: a launch-review audit scores against its declared categories (the eight observability + performance categories of this pass). Things you notice that fall outside those categories are still worth recording — a future audit or a backlog grooming pass may pick them up — but they are **not** scored here and do not count toward or against coverage. Writing them down separately is how a senior keeps the scorecard honest: the count in `SUMMARY.md` reflects only the in-scope categories, and out-of-scope noise never inflates or deflates it.

## Observations

- **Denormalized `customerName` on `invoices` duplicates the `customers.name` it now references.** `src/db/schema.ts` (the `invoices` table) keeps a `customerName` text column from the pre-095 lineage *and* a `customerId` FK to the new `customers` table (and the `customer` relation). The name now lives in two places, so a customer rename leaves the invoice's `customerName` stale unless every write updates both. This is a data-modeling / code-quality observation — drop `customerName` and read the name through the relation, or keep it as a deliberate point-in-time snapshot (the name *as billed*) and document that intent. It is **not** one of the eight categories (it is neither an observability gap nor a measured performance defect — the N+1 in finding 008 is the performance issue on this table), so it is recorded here, not scored.

- **The `/api/test/throw` route is a deliberate diagnostic affordance, not a defect.** `src/app/api/test/throw/route.ts` throws unconditionally on `GET`. In a real review this would read as a finding ("an unguarded route that 500s"), but here it is the *provided proof target* for finding 001's deliberate-throw test, documented in the README. Recording it as out-of-scope is the honest move: name why it is intentional so a future audit doesn't re-flag it, and note that it must not ship to production (gate it behind a non-production env check before launch). Not scored — it is test scaffolding, not a category defect.

These are observations, not findings. They carry no severity and no clause-by-clause score; they exist so the next pass (or the backlog) inherits the context, and so the eight-category count stays clean.
