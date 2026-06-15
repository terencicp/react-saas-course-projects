# ADR 0007 — Cache entitlement reads with cacheTag

## Status

Accepted — 2026-06-15

## Context

`getPlanEntitlement(orgId)` is the entitlement read behind `/plan` and every gate that asks "what plan is this org on, and how many seats does it have." It is a hot, org-scoped read: it runs on most app navigations, the value changes rarely (only when a mutation touches plan or entitlement state), and the surfaces that consume it — the `/plan` overview, seat counters, feature gates — tolerate a short staleness window but must reflect a write the moment the user who made it lands back on the surface (read-your-writes). This mirrors the existing `'use cache'` reads in `lib/invoices/queries.ts`, so a cached read is the established pattern, not a new invention.

Two alternatives were considered and rejected. **Per-request reads with no cache** keep the value trivially fresh but re-run the entitlement lookup on every navigation for a value that almost never changes — needless work on the hot path, and it forfeits the tag-based invalidation the rest of the stack uses. **`revalidatePath`** ties invalidation to routes, not to data: it would force every plan-touching route to enumerate itself at each mutation seam, and any new surface reading the entitlement would silently miss invalidation — the coupling points the wrong way. A data-keyed cache tag is the shape that matches the access pattern.

## Decision

We will cache `getPlanEntitlement(orgId)` with `cacheTag(orgPlanEntitlementTag(orgId))` (the tag string `org:{orgId}:plan-entitlement`) and `cacheLife('minutes')`, and invalidate it via `updateTag(orgPlanEntitlementTag(orgId))` from every mutation seam that touches plan or entitlement state.

## Consequences

- **Every plan/entitlement mutation seam now owns an `updateTag` call.** Today that is the `updatePlanLabel` action in `src/app/(app)/plan/actions.ts`; every future seam that writes plan or entitlement state (a Stripe-driven plan change, a seat-count adjustment) must call `updateTag(orgPlanEntitlementTag(orgId))` after the commit, before the redirect, through the `tags.ts` helper — never a raw string.
- **Background jobs and webhooks invalidate from the non-action path.** A job or webhook that mutates entitlement state outside a Server Action — no user sitting on a redirect — invalidates with `revalidateTag(orgPlanEntitlementTag(orgId), 'max')` (the eventual primitive, chapter 032), exactly as `src/server/jobs/summary-recompute.ts` does for the summary tag. The second `cacheLife` profile argument is mandatory in Next.js 16; the single-argument form is a type error.
- **Reads tolerate a bounded staleness window.** Between invalidations, the value can be up to one `'minutes'` profile stale. That is acceptable for the consuming surfaces; a write the user just made is fresh because `updateTag` runs synchronously in their action before the redirect.
- **The failure mode is a forgotten invalidation.** A mutation that touches plan or entitlement state without calling `updateTag` leaves the entitlement stale for the staleness window — silent, no error. Routing every write through the `tags.ts` helper and reviewing new mutation seams for the `updateTag` call is the guard.
- **Reversal is cheap.** Backing this out is one PR: delete the `'use cache'`/`cacheTag`/`cacheLife` annotation on the read and the `updateTag`/`revalidateTag` calls at the mutation seams. No data migration, no schema change.
