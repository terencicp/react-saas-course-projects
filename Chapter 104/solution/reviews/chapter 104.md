Pass order: correctness/security → principles → patterns → tests/contracts → style

Started at: correctness/security — the top of the stack, reading the write-side mutations in `src/app/(app)/plan/actions.ts` before anything else.

**blocking:** `src/app/(app)/plan/actions.ts` L18-21 — `updatePlanLabel` hand-rolls `getSession()` with an `if (!session) throw`, so it accepts any signed-in user (no role check), drops the tenant scope on the org update, and runs a write-side mutation with no rate limit.
Principle/pattern: SaaS pattern #2 (lesson 2 of chapter 057 — `authedAction(role, schema, fn)`) and Principle #5 use-framework-conventions (chapter 029 / chapter 042).
Action: replace the manual auth and parse with `authedAction('admin', updatePlanLabelSchema, async (input, ctx) => { ... })`, which closes the role, tenant, and rate-limit gaps in one named seam.

**blocking:** `src/app/(app)/plan/page.tsx` L1 — the file's first line is a bare `import '@/lib/analytics/page-view-tracker'` whose module body fires a `fetch` at server-render time, so the page render carries an invisible network side effect that the call site gives no name to.
Principle/pattern: Principle #6 explicit-over-magic (chapter 029) — a side effect must be a named call, not a consequence of an import.
Action: drop the bare import and fire the page view through a named `trackPlanPageView()` call in an event handler inside a Client Component, or remove it entirely if PostHog auto-capture already covers the page view.

**blocking:** `src/lib/plan/renewal-countdown.ts` L9 — `renewalCountdownDays` computes `new Date(renewsAt).getTime() - Date.now()` divided by `1000 * 60 * 60 * 24`, which assumes every day is exactly 24h, so it returns the wrong day count across a DST boundary, and it reads the machine clock instead of the viewer's profile timezone.
Principle/pattern: SaaS pattern #13 time/dates/timezones (chapter 083) — user-visible day math runs on `Temporal`, not epoch-millisecond arithmetic.
Action: switch to `Temporal.PlainDate.from(renewsAt).until(today, { largestUnit: 'days' })` **and** read `today` in the timezone from the user profile so the count is correct across DST and per-viewer.

**blocking:** `src/app/(app)/plan/seat-usage.tsx` L15-21 — `seatsRemaining` is held in `useState` and re-synced from the `seatsAllocated`/`seatsUsed` props through a `useEffect`, so the rendered value can disagree with the props for one frame after they change even though it is fully derivable from them.
Principle/pattern: Principle #7 impossible-states-unrepresentable / derive-don't-sync (chapter 025) — state derivable from props is not state.
Action: delete the `useState` and the `useEffect` and compute `const seatsRemaining = seatsAllocated - seatsUsed` inline during render, which removes the lagging-frame window entirely.

**blocking:** `src/app/(app)/plan/actions.ts` L33 — `updatePlanLabel` writes `org.planLabel` with no `logAudit` call, so a security-relevant mutation of the organization's plan label leaves the compliance trail silent on who changed it and when.
Principle/pattern: the canonical audit-log event catalog (lesson 5 of chapter 057 / lesson 3 of chapter 081) — every security-relevant mutation writes one `entity.verb-pasttense` event inside its transaction.
Action: add `logAudit(tx, { action: 'organization.plan-label-changed', subjectType: 'organization', subjectId: org.id, payload: { planLabel } })` **inside the transaction** alongside the label write so the trail and the data can never disagree.

## Summary

5 blocking, 0 suggestion, 0 question, 0 nit, 0 praise.

The change is ~220 LOC, under the ~400-LOC threshold from lesson 1 of chapter 103, so no structural "split this PR" comment is warranted — it is a single, reviewable surface.

Pass-order recap: the five blockers surfaced top-down on the review stack — correctness/security first (the auth bypass in comment 1, the silent audit trail in comment 5), then principles (the magic side-effect import in comment 2, the derived-state effect in comment 4), then patterns (the `Date` time math in comment 3); tests/contracts and style passes found nothing blocking.

Verdict: request changes — five blocking issues, see comments 1–5.

## Bonus (extra credit, non-blocking)

**suggestion:** `src/lib/plan/get-plan-entitlement.ts` L8 — `getPlanEntitlement` is an exported cross-module read with no TSDoc; a one-line summary of its cache contract would help callers.
Principle/pattern: doc-ships-with-the-PR (lesson 3 of chapter 102).
Action: add a TSDoc comment naming the `'use cache'` + `cacheTag` contract above the export.

**nit:** `src/app/(app)/plan/seat-usage.tsx` L23 — `handlePlanThing` is a vague handler name.
Principle/pattern: Principle #4 name-for-intent (style pass).
Action: rename to `handleRecomputeSeats` (or delete with the derived-state fix, which removes the handler too).

**praise:** `src/lib/plan/` and `src/app/(app)/plan/` — the plan feature is co-located by domain rather than scattered across global `lib/`.
Principle/pattern: Principle #1 co-locate-by-feature.
Action: none — keep this.
