# Finding 005 — Dashboard RSC waterfall: four sequential awaits, two of them independent

**Category:** RSC waterfall (chapter 094, lesson 6).
**Severity:** medium — the page renders correct data and nothing is lost; the cost is render latency on the authenticated landing surface, roughly a third of it avoidable. Medium, not high: it is a measurable slow path the operator sees in a trace, not a user-facing breakage, and the fix is one line.

## Rule

Run the dependency-check before every `await` in a Server Component: two reads that don't consume each other's result must not block in sequence (chapter 094, lesson 6 — `RSC waterfalls and the dependency-check reflex`). Independent reads parallelize with `Promise.all`; only a genuine data dependency (B needs A's output) stays sequential.

## Location

`src/app/(protected)/dashboard/page.tsx`, lines 16–23 — the component awaits four reads back to back:

```
requireOrgUser() → getOrganization(orgId) → listInvoicesWithCustomer({ orgId }) → listMembers(orgId)
```

`user → org` is a real dependency: `orgId` comes from the session, so `getOrganization` can't start until `requireOrgUser` resolves. But `listInvoicesWithCustomer` and `listMembers` both take only `orgId` and neither reads the other's result — they are independent, yet the second `await` blocks on the first.

How it surfaced — read the running app first, then confirm in source. Load `/dashboard` as the seeded admin with the Chrome DevTools Performance panel (or a Sentry trace) recording. The trace shows a **staircase**: four spans laid end to end with idle gaps between them, the invoices span and the members span sitting one after the other instead of overlapping. Then confirm in source with a grep:

```
rg -n "await " "src/app/(protected)/dashboard/page.tsx"
```

The four `await`s on consecutive lines are the fingerprint; the trace is what makes the wasted span visible before you ever open the file.

## Consequence

The page takes the **sum** of four round-trips when the sum of three is reachable. With the seeded data the render lands around 320ms where roughly 240ms is achievable — the invoices read (~80ms over the seeded ≥30 rows) and the members read (~40ms) run nose to tail instead of overlapping, so the cheaper of the two is pure dead time on the critical path. Operator-visible as a slow authenticated landing: the dashboard is the first screen every signed-in user hits, the latency compounds with the N+1 in finding 8 (the invoices span is itself inflated), and the gap widens as either list grows.

## Fix

Documented, not patched — the page keeps the sequential body so the staircase stays readable for the lesson. The senior reach parallelizes **only the independent pair**:

```tsx
const { user, orgId } = await requireOrgUser();
const org = await getOrganization(orgId);

// Independent of each other — both depend only on orgId, so start them together.
const [invoices, members] = await Promise.all([
  listInvoicesWithCustomer({ orgId }),
  listMembers(orgId),
]);
```

`user → org` stays sequential — `org` genuinely needs `orgId`, and wrapping it into the `Promise.all` would be the "wrap everything" anti-pattern that breaks the dependency. The discipline is to ask "does this await consume the previous result?" at each one and parallelize only where the answer is no. For request-scoped dedup of a read called from more than one place, React `cache()` is the companion tool (not `unstable_cache`) — not needed here, but named as the next reach.

Half-credit wraps all four reads in one `Promise.all` (it parallelizes the independent pair but breaks the `user → org` dependency, or relies on luck); full credit parallelizes the invoices/members pair only and leaves `user → org` sequential.
