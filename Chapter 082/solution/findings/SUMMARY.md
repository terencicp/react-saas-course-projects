# Audit coverage scorecard

The eight categories are the pass. This scorecard records what the audit covered, scores each finding clause-by-clause against the answer key, names the two bonus findings reached above the floor, lists the senior-reach detail most students miss per finding, and folds every discovery command into a personal checklist for the next pass.

## Coverage

**10/10 — 8/8 floor met, both bonus findings reached.** One finding per category, none deliberately skipped, plus the two off-floor defects a thorough read surfaces. The audit shape held: one category at a time, the running app and the source open side by side, the finding written before moving on.

| # | Category | Finding | Severity |
|---|---|---|---|
| 1 | Fail-closed checks (080 L1) | `001-fail-closed.md` | critical |
| 2 | XSS sinks (080 L2 + 081 L1) | `002-xss-html-sink.md` | critical |
| 3 | Audit-log gaps (081 L3) | `003-audit-log-ownership-transfer.md` | high |
| 4 | Security headers (081 L1) | `004-csp-header.md` | high |
| 5 | Secrets + env validation (081 L6/L7) | `005-secret-next-public.md` | critical |
| 6 | Rate-limit coverage (081 L2) | `006-rate-limit-password-reset.md` | high |
| 7 | Dependency hygiene (081 L8) | `007-dep-hygiene.md` | high |
| 8 | GDPR deletion (081 L4) | `008-gdpr-deletion.md` | critical |
| 9 | Consent gate (081 L5) — **bonus** | this file | high |
| 10 | `safeLimit` seam (080 L3) — **bonus** | this file | medium |

**Deliberate misses: none.** Every category got a finding, so there is no "scored 0, here is why" row this pass. If a category had been left unscored, the rule is one sentence of cause here — quantifying the miss is itself part of the deliverable, and a documented miss feeds the checklist below.

## Scoring rubric (clause-by-clause)

Each finding is scored on four clauses, applied in this order:

1. **Rule match (floor).** The finding names the correct chapter-080/081 rule, linked by lesson section. A finding that names the wrong rule — or none — has not run the pass for that category, regardless of how good the prose reads.
2. **Location match (floor).** The finding names the file and line range **and the grep/curl command that surfaced it**, including the legitimate non-finding hits the command also returned. A defect spotted by code-review opinion with no command behind it does not clear the floor.
3. **Consequence match.** The finding states the failure in user-visible or legal terms (the read-aloud test), no "could potentially" hedging.
4. **Fix-detail match (the reach).** The fix names the senior reach by its helper/wrapper/config, not a vaguer version.

**Partial credit.** Rule + location is the audit floor — a student who names the rule and location but proposes a less-thorough fix is still doing the audit and scores partial. A student who names neither has not run the pass for that category. Fix detail is where the reach lives; the per-finding gaps below are the fix-clause details the answer key checks for.

## Senior-reach detail per finding (the most-missed fix clause)

The floor (rule + location) is reachable on a careful read. The reach is the fix detail students most often stop short of — listed here so the side-by-side comparison has a checklist.

- **F1 — fail-closed.** Reach: let `authedAction` convert the throw. The partial answer re-throws inside the catch; the senior reach removes the `try/catch` entirely so the call site holds no error machinery and the wrapper owns the conversion to `{ ok: false, error: { code: 'unauthorized' } }`.
- **F2 — XSS sink.** Reach: sanitize at write **and** read (the historical-data vector). Sanitizing on write alone leaves every pre-existing note shipping raw — `DOMPurify` at the read seam plus a one-time backfill is the full answer; a write-only sanitizer is the common partial.
- **F3 — audit-log gap.** Reach: the exact slug `org.ownership-transferred` (single-dot `entity.verb-pasttense`), written **inside** the transaction via `logAudit(tx, …)` with the redacted `{ previousOwnerId, nextOwnerId }` payload. The partial names "add a log"; the reach names the slug, the in-tx write, and the payload schema.
- **F4 — CSP.** Reach: the per-request **nonce** plus `'strict-dynamic'`, minted in `proxy.ts` and threaded via `x-nonce`. A host-allow-list CSP without a nonce is the anti-pattern, not the fix.
- **F5 — secret in `NEXT_PUBLIC_*`.** Reach: **rotation**, not only rename-and-move. The key already shipped to production; the server-partition move plus Server Action is the structural fix, but treating the leaked key as live and rotating it Vercel-before-provider is the clause students skip.
- **F6 — rate limit.** Reach: **dual keying** — per-IP **and** per-email. Per-IP alone leaves the inbox-bomb and enumeration vectors open; the coverage matrix is the second half of the deliverable.
- **F7 — dep hygiene.** Reach: the `pnpm-workspace.yaml` defaults (`minimumReleaseAge: 1440`, `blockExoticSubdeps: true`, `strictDepBuilds: true`), not just a version bump. The pre-install window is the load-bearing fix; `pnpm audit` is a post-install signal, not the defense.
- **F8 — GDPR deletion.** Reach: the **full graph** plus **anonymize** the audit log (not hard-delete). Naming only `org_members` is the common partial; the reach walks every table and external service and resolves the deletion/audit-trail tension by anonymizing the append-only rows.

## Bonus finding 9 — Consent gate missing on PostHog (081 L5)

**Category:** consent gate. **Severity:** high — analytics fire before the user has had any chance to consent, so every first page load is a pre-consent capture; it is high rather than critical because it is a legal/consent posture failure, not a data breach or access bypass.

**Rule.** Nothing fires before consent: the consent gate's load-bearing rule is that no analytics, no tracking, no third-party network call carrying user signal leaves the page until the user has recorded consent (chapter 081, lesson 5 — the pre-consent boundary).

**Location.** `src/app/_components/providers.tsx`, the `useEffect` at lines 18–34: `posthog.init(...)` runs with `opt_out_capturing_by_default: false` (line 31), and there is no `ConsentProvider` anywhere under `src/app`. Surfaced by `grep -n 'opt_out_capturing_by_default' src/app/_components/providers.tsx` (returns the `false` literal) and `rg -Rn 'ConsentProvider' src/app` (zero hits — the gate component does not exist). Running-app fingerprint: a `POST` to the PostHog ingest host leaves the browser on first page load, before any consent UI, visible in DevTools' Network tab.

**Consequence.** PostHog captures and transmits behavioral data the moment the page mounts, before the user has been asked anything. In legal terms this is tracking without consent — the exact posture GDPR/ePrivacy consent rules forbid — and the company is collecting and sending user analytics to a third party with no lawful basis recorded. The "we'll add the banner later" framing does not help: the capture already happened on the first load.

**Fix.** The two-belt gate: set `opt_out_capturing_by_default: true` so PostHog stays silent until explicitly opted in, **and** dynamic-import / initialize the analytics only after consent is recorded (a `ConsentProvider` that flips capturing on, and writes the `consent.recorded` audit event — the canonical slug, single-dot `entity.verb-pasttense`). Belt one stops the pre-consent capture; belt two stops the SDK from even loading until it is allowed to. Naming only `opt_out_capturing_by_default: true` is the partial; the reach is both belts plus the recorded-consent event.

## Bonus finding 10 — `safeLimit` bypass on a worker endpoint (080 L3)

**Category:** the `safeLimit` single-seam rule. **Severity:** medium — a fail-open policy is bypassed on one internal endpoint, so a Redis outage 500s a worker ingress (fail-closed by accident, the wrong direction) and skips the operator-honest log; it is medium because it is an internal endpoint with no direct data or access exposure, but it violates the single-seam discipline that keeps the fail-open policy in one place.

**Rule.** Every limiter call routes through the one `safeLimit` seam: `safeLimit` is the single place the fail-open policy lives (a Redis outage logs `rate_limit_unavailable` and lets the request through rather than 500ing), so a bare `limiter.limit()` outside it is a second, divergent error path (chapter 080, lesson 3 — the single-seam rule; one place owns the failure behavior).

**Location.** `src/app/api/exports/trigger/route.ts`, line 19: `const result = await signInLimiter.limit(key)` — a bare `.limit()` call that does not route through `safeLimit`. Surfaced by `rg "\.limit\(" src/lib/exports src/app/api | rg -v "safeLimit"` (returns this one hit). Recorded as distinct from finding 6's coverage matrix: that row is a *bypass* (the limiter is called, just not through the seam), not a *missing limiter* — a different rule, so its own finding.

**Consequence.** On a Redis outage the bare `.limit()` throws and the export-trigger endpoint returns a 500 instead of failing open — the worker ingress goes down exactly when the rate-limit backend does, the opposite of the `safeLimit` policy that keeps the path up and logs the degradation. The bypass also skips the `rate_limit_unavailable` operator log every gate is supposed to write, so the outage is invisible to the operator. It is internal, so no customer-facing data is exposed, but the fail-open discipline is broken on one of the endpoints that most needs to stay up under load.

**Fix.** Route the call through `safeLimit` (`src/lib/safe-limit.ts`) like every other limiter in the lineage: `await safeLimit(signInLimiter, 'rl:export-trigger', key)`, so a Redis outage logs and fails open instead of 500ing, and the one seam owns the failure behavior. The fix is the seam, not a `try/catch` around the bare call.

## Through-threads (what ran across the whole pass)

- **The two chapter-080 commitments.** *Fail-closed* (findings 1 and bonus 10 — a thrown or failed check is a refusal, never a pass, and the failure behavior lives in one seam) and the *user-message-vs-operator-record split* (finding 2's sink crosses the seam unsanitized; finding 1's swallowed log is fail-open dressed as discipline). Both error findings read against these two rules.
- **The single-place-to-lint pattern.** Every finding was grep-able because the lineage keeps each concern in one named place: `authedAction` (the auth seam), `safeLimit` (the fail-open seam), `logAudit` (the audit seam), `src/env.ts` (the env boundary), `pnpm-workspace.yaml` (the supply-chain settings). A defect is a deviation from the one place, which is exactly what a command finds — and what a future lint rule or CI gate (chapter 097) automates.
- **Coverage over depth.** Every category got a finding or a written decision; the off-category observation went to `out-of-scope.md` rather than inflating the count. The deliverable is the *matrix*, not the deepest single finding.
- **The audit shape is portable.** Name the rule, name the location with the command that surfaced it, name the consequence for a human, name the senior fix. The same four clauses score any codebase; the eight categories are this unit's instance, not the limit of the method.

## Forward pointers (each thread the next chapters pick up)

- **Chapter 088** — integration tests against `authedAction` and the message-mapper (finding 1's seam under test).
- **Chapter 090** — a Playwright money-path test exercising the rate limit and the consent gate (findings 6 and bonus 9).
- **Chapter 092** — Sentry's `beforeSend` redactor, the operator side of the message split (finding 2's other half).
- **Chapter 095** — the observability and performance audit on this same target, where the consent-gate finding re-surfaces if unfixed (bonus 9).
- **Chapter 097** — CI gates that catch some of these findings at PR time, and the `--frozen-lockfile` enforcement finding 7 names as a follow-up.
- **Chapter 104** — a seeded-PR review using the same disciplined-reading muscle this pass trained.

Fixing these findings is the next sprint's work, out of scope for this pass — the audit's job was to find and document them, not to patch.

## Personal grep/curl checklist (fold every category's discovery command here)

The senior reflex is to fold every miss into a reusable checklist so each pass sharpens. These are the commands behind the ten findings — run top to bottom on the next codebase.

```sh
# 1. Fail-closed — Server Actions off the canonical wrapper + role checks in a try/catch.
rg -l "'use server'" --glob '*.ts' src | xargs rg --files-without-match 'authedAction'
rg -n "requireRole\('owner'\)" src --glob '*.ts'

# 2. XSS sinks — the HTML-injection family (dangerouslySetInnerHTML is the React member).
rg -n "dangerouslySetInnerHTML" src
rg -n "eval\(|new Function|innerHTML\s*=|setTimeout\(['\"\`]" src   # adjacent shapes

# 3. Audit-log gaps — every transaction cross-walked against the six-category event set.
rg -n "db.transaction" src/lib --glob '*.ts'
rg -n "\.update\(" src/lib --glob '*.ts'      # mutations that must carry a logAudit row

# 4. Security headers — the running-app fingerprint, then confirm the source gap.
curl -sI http://localhost:3000/ | grep -i 'security\|content-security\|frame\|referrer'
rg -ni 'content-security-policy|nonce|strict-dynamic' next.config.ts src/proxy.ts

# 5. Secrets + env — secret-shaped NEXT_PUBLIC_*, raw process.env, and the read site.
rg -n 'NEXT_PUBLIC_' src/env.ts
rg -n 'process\.env\.' --glob '!src/env.ts' src
rg -Rn 'NEXT_PUBLIC_RESEND_API_KEY|NEXT_PUBLIC_.*(KEY|TOKEN|SECRET)' src/app

# 6. Rate-limit coverage — declared limiters vs. what imports each, then hammer by hand.
rg -n 'new Ratelimit' src/lib/rate-limit.ts
rg -Rn 'safeLimit|Limiter' src/app
for i in $(seq 1 20); do curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST localhost:3000/api/auth/reset-password \
  -H 'content-type: application/json' -d '{"email":"victim@example.com"}'; done

# 7. Dep hygiene — the deterministic read (no install), then the post-install signal.
rg -n 'minimumReleaseAge|blockExoticSubdeps|strictDepBuilds|allowBuilds' pnpm-workspace.yaml
rg -n 'minimumReleaseAge|blockExoticSubdeps|strictDepBuilds' .npmrc   # should be zero hits
pnpm audit --prod

# 8. GDPR deletion — the handler vs. the full retention catalog and externals.
rg -n "delete\(" src/lib/account/delete-account.ts
rg -n "references\(\(\) => user(s)?\.id" src/db/schema.ts src/db/schema/auth.ts src/db/audit.ts

# 9. Consent gate — capturing default + the absence of a consent provider.
rg -n 'opt_out_capturing_by_default' src/app
rg -Rn 'ConsentProvider' src/app       # zero hits = no gate

# 10. safeLimit bypass — a bare .limit() not routed through the seam.
rg "\.limit\(" src/lib/exports src/app/api | rg -v "safeLimit"
```
