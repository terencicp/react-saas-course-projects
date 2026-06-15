# Audit coverage scorecard

The eight categories are the pass. This scorecard records what the audit covered, scores each finding clause-by-clause against the answer key, names the bonus findings reached above the floor, and folds every discovery surface into a personal checklist for the next pass.

## Coverage

**10/10** — the 8/8 floor (one finding per category) plus both bonus findings.

| # | Finding | Category | Half | Severity |
|---|---|---|---|---|
| 001 | Sentry not wired | Error monitoring (092 L1) | wired | critical |
| 002 | `stripe-signature` logged in the clear | Structured logs / 3am rule (092 L3) | wired | high |
| 003 | No request correlation id | Structured logs / correlation (092 L2) | wired | medium |
| 004 | PostHog captures before consent | Consent-gated analytics (093 L3, 081 L5) | wired | high |
| 005 | Dashboard RSC waterfall | RSC waterfall (094 L6) | documented | medium |
| 006 | `lucide-react` barrel import | Bundle size / barrel + analyzer (094 L3/L4) | documented (one-line fix) | high |
| 007 | Missing `preload` on the LCP hero | LCP / Core Web Vitals (094 L2) | documented | high |
| 008 | N+1 in the invoice list | N+1 at the DB layer (094 L7) | documented | medium |
| 009 | Marketing font via raw `<link>` | LCP / Core Web Vitals (094 L1/L2) | bonus, documented | medium |
| 010 | Missing `(org_id, created_at)` index | Missing DB index (094 L7) | bonus, documented | medium |

No deliberate misses: every one of the eight categories landed a finding, so the floor is met at 8/8 and the two bonus findings (009 `next/font`, 010 the composite index) push coverage to 10/10. The split is the chapter's structural lesson — **the four observability findings (001–004) are wired** (the diff between `start/` and `solution/`), **the four performance findings (005–008) plus both bonuses are documented**, never patched, with the sole exception of finding 006's one `optimizePackageImports` line (the analyzer before/after is the required evidence).

## Scoring rubric (clause by clause)

Each finding is scored against the four template sections, not as pass/fail:

- **Floor (the finding lands):** **Rule** names the specific chapter-092/093/094 rule and its lesson section, and **Location** names the file + line range *and* the diagnostic surface that surfaced it (a grep, a DevTools trace, the Network panel, `pnpm next experimental-analyze`, `.toSQL()`, `EXPLAIN ANALYZE`). Rule + Location is the floor: it proves the auditor found the real defect at the real call site by the real method.
- **Reach (the finding is senior):** **Consequence** is operator- or user-visible (a timing, a leaked secret, lost data — never "code smell," never "could potentially") and **Fix** names the installed seam (wired findings) or the senior reach by its helper/config (documented findings). Consequence + Fix-detail is the reach.
- **Partial credit:** Rule + Location match but the Fix is less thorough. The named partial-credit lines per finding:
  - **006** — per-icon imports (`lucide-react/dist/esm/icons/<icon>`) instead of `optimizePackageImports`: shrinks the bundle but is per-call-site churn, half-credit against the single-seam config entry.
  - **008** — a hand-written `innerJoin`/`leftJoin` instead of `findMany({ with: { customer: true } })`: removes the N+1 but reintroduces manual row-shaping, half-credit against the relations API.
  - **010** — naming the composite index without generating the migration: the index changes nothing until the migration runs, half-credit against declare-plus-generate.
  - **009** — naming only the render-blocking request and stopping, without `next/font`'s fallback-metrics (the CLS half): half-credit.

A severity with a two-line justification is part of every finding's score — calling a wired observability gap "low" or a documented performance defect "critical" is itself a scoring miss (the verdict, below, is the discipline).

## Senior-reach detail per finding (what students most often miss)

The Rule + Location floor is the common pass; the reach below is what separates a senior audit. Self-grade against this list.

- **001 (Sentry):** release computed from `VERCEL_GIT_COMMIT_SHA` (never hardcoded — a hardcoded `'v1.0.0'` ties a week of unrelated errors to one version), `widenClientFileUpload: true`, source-map upload gated on `SENTRY_AUTH_TOKEN` at **build** time (missing token ⇒ a minified "line 1 column 12345" stack), `onRequestError = Sentry.captureRequestError` (the most-omitted piece — framework-boundary throws never reach Sentry without it), and only the four `withSentryConfig` keys (`silent`, `org`, `project`, `widenClientFileUpload`).
- **002 (log leak):** **one `redact`, two callers** (Pino's `redact` config *and* Sentry's `beforeSend` from a single definition), with the wildcard `*_KEY`/`*_SECRET` patterns that catch the next secret a developer adds without touching the seam. Scrubbing at each call site instead of one seam is the named trap.
- **003 (correlation):** `AsyncLocalStorage` (never module-level state, which bleeds one request's id into the next under concurrency), the Pino `mixin` stamping `requestId` automatically, the `requestId` joined to the Sentry event as **context** (not a tag — a per-request value would explode the low-cardinality tag index), set request-scoped *inside* `beforeSend` (never at module scope, where there is no request at boot), and the response header echoed so downstream services join the same request.
- **004 (consent):** the load-bearing **pair** — `opt_out_capturing_by_default: true` *and* `posthog.opt_in_capturing()` on the consented branch (default-out alone never captures even after consent; a banner acting only on "Accept" leaves "Reject" in the default state) — both routed through the one `consent.ts` seam, plus belt two (the consent-gated dynamic `import('posthog-js')`) and the session-continuity re-call of `opt_in_capturing()` on mount when the cookie is present.
- **005 (waterfall):** `Promise.all` the **independent pair only** (`invoices`/`members`), leaving `user → org` sequential — wrapping all four is the "wrap everything" anti-pattern that breaks the real dependency. React `cache()` (not `unstable_cache`) is the named companion for request-scope dedup.
- **006 (barrel):** `optimizePackageImports` as the single seam (not per-icon imports), with `sideEffects: false` named as the internal-package companion lever.
- **007 (LCP image):** `preload` exactly once per page (the Next.js 16 prop, renamed from `priority`), `width`/`height` as the CLS protection layer, and the `@next/next/no-img-element` ESLint rule at error as regression prevention.
- **008 (N+1):** `findMany({ with: { customer: true } })` (the relations API emits one lateral-join statement — the "the ORM secretly N+1s" fear is dead), verified with `.toSQL()` (one statement, not N).
- **009 (font):** `next/font` for self-hosting (kills the third-party render-blocking request on the LCP path) *and* its size-adjusted fallback metrics (kills the swap reflow / CLS) — both halves.
- **010 (index):** the leftmost-prefix composite `(organization_id, created_at, id)` *and* the `drizzle-kit`-generated migration, verified with `EXPLAIN ANALYZE` (the `Seq Scan` + in-memory `Sort` flips to an `Index Scan`).

The final analyzer treemap (finding 006's `after-barrel.png`) is secondary evidence for the whole bundle-size half of the pass — paste it here alongside the per-finding embed as the at-a-glance proof the heaviest avoidable weight is gone.

## The two senior verdicts

The categories split into two verdicts, and getting the verdict right is part of the discipline:

- **Observability gaps (001–004) close *before* launch.** They lose data — an invisible incident, a leaked secret, an unjoinable trace, behavior captured without consent. You cannot recover the error you never saw or the consent you never asked for. These are wired in `solution/`; they are not backlog items.
- **Performance gaps (005–008, 009, 010) go to the *backlog* with measured impact.** They are slow, not bleeding — the app renders correct data, just heavier or later. They ship documented (with the timing, the byte count, the query count, the plan node) so the team can prioritize them against feature work, and they are fixed deliberately, not in a documentation pass (mixing a fix into a documentation pass is the named trap of this chapter).

The structural pattern threaded through both halves: **wire the seam, prove it on the running surface, document what you won't fix yet, and self-grade honestly.** Each cross-cutting rule lives at exactly one seam the team configures once — Sentry's `beforeSend` redactor, the logger's `AsyncLocalStorage` mixin, the consent `grant/revoke` pair, `optimizePackageImports` — and **coverage over depth** is the audit ethic: one finding per category, the floor met before any bonus, the count honest.

## Personal diagnostic checklist (read the running app first)

The discipline the reference finding (007) established: open the running app, hold it beside the source, read one finding's fingerprint, write it before moving on. Each category has a surface that names the defect faster than reading code — fold them into the next pass:

- [ ] **Errors** — hit `GET /api/test/throw` with the Sentry dashboard open: does a decoded event land? (finding 001)
- [ ] **Log hygiene** — replay a webhook (`stripe trigger …`) and watch the dev console: does any header/secret print where `[REDACTED]` belongs? (finding 002)
- [ ] **Correlation** — trigger the throw and compare the log lines to the Sentry event: do they share a `requestId` you can pivot on? (finding 003)
- [ ] **Consent** — open `/` in incognito with the Network panel filtered to `ingest`/`posthog`: does anything fire before the banner? (finding 004)
- [ ] **RSC waterfall** — record a DevTools Performance trace of `/dashboard`: is there a staircase of sequential spans with idle gaps? (finding 005)
- [ ] **Bundle size** — run `pnpm next experimental-analyze` and open the treemap under `.next/diagnostics/analyze`: any single dependency tile dominating a route? (finding 006, the analyzer)
- [ ] **LCP path** — DevTools Performance LCP marker + the Network panel on `/`: is the LCP element `preload`-ed, and is the font self-hosted or a render-blocking third-party `<link>`? (findings 007, 009)
- [ ] **N+1** — DevTools/Sentry trace of `/dashboard` + `.toSQL()`: is the query count flat, or 1 + N? (finding 008)
- [ ] **Indexes** — `EXPLAIN ANALYZE` the org-scoped, ordered reads: a `Seq Scan` + in-memory `Sort` where an `Index Scan` belongs? (finding 010)

## Forward pointers

What this pass deliberately leaves for later units:

- **CI gates** — wiring the source-map-upload verification, a bundle-size budget, and `@lhci/cli` into a GitHub Actions gate so these checks run on every PR is **chapter 097** (Unit 20). Findings name "wire this into CI later" as a *follow-up*, never as the fix.
- **The Vercel Drain** — shipping the structured logs to a queryable drain (Axiom/APL) is a deploy-time concern, **chapter 098**. The logger work names the drain as the follow-up; it does not wire one here.
- **The migration workflow** — bonus 010's index uses the Unit-5 migration mechanics; the expand-migrate-contract workflow for zero-downtime schema changes is **chapter 100**.
- **Reviewing a seeded PR** — applying this same read-the-surface, name-the-seam discipline to a teammate's pull request is **chapter 104**.
