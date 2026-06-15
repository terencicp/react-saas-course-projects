# Finding 006 — Unthrottled password-reset endpoint sends mail on every call

**Category:** Rate-limit coverage (security baseline).
**Severity:** high — the endpoint costs money on every request and weaponizes the product's verified domain against arbitrary inboxes, but it does not directly expose data or grant access, so it sits below the critical secret leak (finding 5) and above a config-only gap.

## Rule

Every abusable endpoint routes through one of the named limiters in `lib/rate-limit.ts`, and an endpoint is abusable — a limiter is mandatory — when it matches any one of three triggers: it costs money per call, it can be used to attack a third party, or it touches state addressable without auth (chapter 081, lesson 2 — the threshold is three triggers, any one; coverage is the deliverable, tracked as a matrix). The password-reset request endpoint matches **two** of the three, so a limiter is not a nice-to-have here, it is required:

1. **Costs money per call.** Each request fires a Resend transactional send (lesson 2, trigger (a) — transactional email is the canonical money-per-call example).
2. **Attacks a third party.** The "email" the caller supplies is someone else's inbox; an attacker drives the send at a victim's address (lesson 2, trigger (b) — the victim's inbox is the third party).

(It is arguably trigger (c) as well — the route is reachable without a session — but the plan scores this finding against the two load-bearing triggers above; either one alone already makes the limiter mandatory.)

## Location

The defect is the *gap between* a declared limiter and the route that should use it, so the location is two files read side by side:

- `src/lib/rate-limit.ts`, lines 23–29: `resetLimiter` is declared at module scope — `Ratelimit.slidingWindow(3, '15 m')`, prefix `rl:reset`. The limiter exists, fully configured, exactly where the lesson says limiters live.
- `src/app/api/auth/reset-password/route.ts`, the `POST` handler at lines 20–44: it parses the email (lines 21–25) and calls `sendEmail(...)` at lines 31–39 with **no limiter in front of it**. Nothing in this file imports `resetLimiter` or `safeLimit`; the declared budget in `rate-limit.ts` is never reached from the one route that needs it.

How it surfaced — the grep discovery, then the by-hand confirmation. Both belong in the report, for different reasons: the grep proves the gap is in the source (auditable, repeatable, CI-able later), the hammer proves the gap is *live* (the running target really sends without a ceiling).

```
# 1. What limiters are declared, and what actually imports each one?
rg -n 'new Ratelimit' src/lib/rate-limit.ts        # -> signIn, signUp, reset declared
rg -rn 'resetLimiter|safeLimit' src/app             # -> resetLimiter: zero hits in app/
# 2. Which handlers send mail or otherwise burn money/attack a third party?
rg -rn 'sendEmail|forgetPassword' src/app           # -> reset-password/route.ts hits, ungated
```

Grep 1 returns `resetLimiter` declared in `rate-limit.ts` and **zero** references to it anywhere under `src/app` — the limiter is dead code from the route's perspective. Grep 2 lands the unthrottled `sendEmail` call in the reset route. Reading the route confirms there is no `safeLimit` import, no limiter call, no 429 path.

Manual confirmation (the hammer): with the target running, POST the same body to `/api/auth/reset-password` repeatedly (e.g. `for i in $(seq 1 20); do curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/auth/reset-password -H 'content-type: application/json' -d '{"email":"victim@example.com"}'; done`). Every request returns `200 {"ok":true}` — there is no `429`, no `RateLimit-*` header, and no slow-down; the seeded Resend path would attempt a send on each one. The opaque success body is correct (it is enumeration-safe by *response*), but the response shape hides that the endpoint is unthrottled by *behavior* — the absence of a 429 across twenty identical submits is the fingerprint.

Recorded as legitimate, not findings: `signInLimiter` and `signUpLimiter` are *also* declared in `rate-limit.ts` and unwired in this target, but the sign-in/sign-up actions route through Better Auth's own `signInEmail`/`signUpEmail` and sign-up is enumeration-closed at the source (`autoSignIn:false`); those are tracked as open rows in the coverage matrix below (gaps are tickets), not folded into this finding, which scopes to the one money-and-third-party endpoint.

## Consequence

An attacker scripts the endpoint and the product mails on command. Pointed at one address, it is an inbox-bomb: a victim's inbox fills with reset emails from the company's verified domain, drowning real mail and training the recipient (and their provider) to treat the domain as spam — so the domain's deliverability degrades for *every* customer, and the transactional mail the product depends on starts landing in junk. Pointed at a list of guessed addresses, it is account enumeration plus a spam relay: the company's own sending reputation is spent blasting unsolicited mail, and the Resend bill climbs one paid send at a time with no ceiling. There is no throttle and no cost cap between an attacker and the product's mail reputation; the only thing limiting the damage is that nobody has aimed a loop at the endpoint yet.

## Fix

The senior reach is the dual-keyed `safeLimit` wrapper this lineage already ships the parts for — not per-IP alone. Per-IP-only lets a distributed sender rotate addresses to keep hammering one victim, and it locks out a shared office NAT; the inbox-bomb and enumeration vectors are *per-email* problems, so the email must be a key too. Both gates must pass.

1. **Add a per-email companion limiter** beside the existing per-IP `resetLimiter` in `src/lib/rate-limit.ts` (e.g. `resetEmailLimiter`, prefix `rl:reset:email`, a tight window), so the route can check per-IP and per-email independently. The existing `resetLimiter` becomes the per-IP gate.
2. **Wrap both checks in `safeLimit`** (the fail-open seam from `src/lib/safe-limit.ts`) so a Redis outage logs `rate_limit_unavailable` and lets the reset path stay up rather than 500ing the password-reset flow — the one place the fail-open policy lives (chapter 081, lesson 2, the `safeLimit` seam).
3. **On reject, return a generic 429 with `RateLimit-*` headers** via the route-handler helpers already present — `rateLimitedResponse(result)` (which sets `RateLimit-Limit/Remaining/Reset` + `Retry-After` and an opaque body) from `src/lib/rate-limit-headers.ts`. This is the route-handler path, so headers are available; on the Server-Action twin the budget rides the `Result` instead (the 075 decision: `headers()` is read-only in a Server Action, so actions carry the budget on the `Result` via `rateLimitBudget`/`rateLimited`, not as HTTP headers). Either way the rejection body is the same opaque "Too many attempts" message — no leak of which gate tripped.

```ts
// reset-password/route.ts — both gates, fail-open, opaque 429.
const ip = ipFrom(request);
const byIp = await safeLimit(resetLimiter, 'rl:reset', ip);
const byEmail = await safeLimit(resetEmailLimiter, 'rl:reset:email', parsed.data.email);
if (!byIp.success || !byEmail.success) {
  return rateLimitedResponse(byIp.success ? byEmail : byIp);
}
// only now: sendEmail(...)
```

### Coverage matrix (the lesson-2 deliverable — every abusable endpoint, one row)

| Endpoint category | File | Limiter (prefix) | Key strategy | Covered |
|---|---|---|---|---|
| Auth — sign-in | `src/app/(auth)/sign-in/actions.ts` | `signInLimiter` (`rl:signin`) declared | per-IP + per-email (dual) | **N** — declared, unwired (ticket) |
| Auth — sign-up | `src/app/(auth)/sign-up/actions.ts` | `signUpLimiter` (`rl:signup`) declared | per-IP + per-email (dual) | **N** — declared, unwired (ticket) |
| Email-sending — password reset | `src/app/api/auth/reset-password/route.ts` | `resetLimiter` (`rl:reset`) declared, **+ per-email** | per-IP **and** per-email (dual) | **N — this finding** |
| Webhook fan-out — Stripe | `src/app/api/webhooks/stripe/route.ts` | signature verify (lesson 1) gates receiver | per-tenant on fan-out | N/A receiver verified; fan-out per-tenant is the open row |
| Worker — export trigger | `src/app/api/exports/trigger/route.ts` | bare `.limit()` — **bypasses `safeLimit`** | (see bonus finding 10) | **N** — bypass, not a coverage gap (different rule) |

Gaps are tickets, not silent decisions: the sign-in/sign-up rows are recorded so the next pass closes them; the export-trigger bypass is its own finding (bonus 10, a `safeLimit`-seam violation, not a missing limiter). Wiring the matrix's discovery greps into CI is the follow-up (chapter 097), not the fix here.
