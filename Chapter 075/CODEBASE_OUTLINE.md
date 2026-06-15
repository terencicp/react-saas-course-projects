# Chapter 075 — Codebase Summary

## Solution file tree

```
src/
  env.ts                                     # t3-oss/env-nextjs boundary; validates all env vars at build time
  proxy.ts                                   # Next.js middleware: session-cookie presence check, redirect guard
  db/
    index.ts                                 # drizzle client (postgres-js); exports db + dbUnpooled alias
    columns.ts                               # Reusable timestamps column group (createdAt, precision:3)
    schema.ts                                # emailSuppressions + rateLimitLog tables + enums
    schema/
      auth.ts                                # CLI-generated Better Auth tables (user/session/account/verification)
  lib/
    utils.ts                                 # cn() helper (clsx + tailwind-merge)
    result.ts                                # Result<T> union type + ok/err/isUniqueViolation helpers
    auth.ts                                  # betterAuth instance, SESSION_COOKIE_PREFIX, getCurrentUser, requireUser
    auth-client.ts                           # createAuthClient() same-origin client for client islands
    auth-schema.config.ts                    # CLI-only auth config for `auth:generate` (no server-only imports)
    auth/
      error-mapping.ts                       # mapAuthError: Better Auth APIError → Result<never>
    email.ts                                 # sendEmail wrapper (Resend + suppression check + inspector mock)
    suppressions.ts                          # isSuppressed(email, {kind}) — reads email_suppressions table
    redirects.ts                             # safeNext(raw): open-redirect guard for ?next= param
    redis.ts                                 # Redis.fromEnv() singleton + pingRedis()
    redis-mock.ts                            # makeDownRedis() + UpstashConnectionError (inspector fail-open demo)
    rate-limit.ts                            # signInLimiter/signUpLimiter/resetLimiter + LIMITER_MAX const
    safe-limit.ts                            # safeLimit(limiter, prefix, key): fail-open wrapper; RateLimitResult type
    keys.ts                                  # getClientIp(headers) + normalizeEmail(email) key helpers
    rate-limit-headers.ts                    # RateLimitBudget type, rateLimitBudget, rateLimitHeaders, rateLimited, rateLimitedResponse
    rate-limit-log.ts                        # logRateLimit(entry): writes to rate_limit_log table
  emails/
    email-tailwind-config.ts                 # Tailwind config for react-email components
    components/
      email-layout.tsx                       # Shared email wrapper component
    welcome-verification.tsx                 # Verification email component
  components/ui/                             # shadcn UI primitives (button, card, input, label, separator, skeleton, sonner)
  app/
    globals.css                              # Global Tailwind styles
    layout.tsx                               # Root layout with Providers
    page.tsx                                 # Root landing page (redirects to sign-in/dashboard)
    _components/
      providers.tsx                          # ThemeProvider + Toaster wrapper
      field-error.tsx                        # Form field error display component
      submit-button.tsx                      # Form submit button with pending state
    (auth)/
      sign-in/
        page.tsx                             # Sign-in route page
        loading.tsx                          # Sign-in Suspense fallback
        sign-in-form.tsx                     # Sign-in form (useActionState → signInAction)
        actions.ts                           # signInAction: dual-keyed (ip+email) rate gate then signInEmail
      sign-up/
        page.tsx                             # Sign-up route page
        sign-up-form.tsx                     # Sign-up form (useActionState → signUpAction)
        actions.ts                           # signUpAction: per-IP rate gate then signUpEmail
      reset/
        page.tsx                             # Password reset request route page
        loading.tsx                          # Reset Suspense fallback
        reset-form.tsx                       # Reset form (useActionState → resetAction)
        actions.ts                           # resetAction: dual-keyed (ip+email) rate gate then requestPasswordReset
      verify-email/
        page.tsx                             # Email verification landing page
        loading.tsx                          # Verify-email Suspense fallback
        verify-email-resend.tsx              # Resend verification email client island
    (protected)/
      layout.tsx                             # Protected layout (requireUser guard)
      dashboard/
        page.tsx                             # Dashboard page
        loading.tsx                          # Dashboard Suspense fallback
      sign-out-action.ts                     # signOutAction server action
    api/
      auth/[...all]/route.ts                 # Better Auth catch-all route handler
      limit-demo/route.ts                    # GET /api/limit-demo — shows raw RateLimit-* headers (route-handler twin)
    inspector/
      page.tsx                               # Rate-limit inspector Server Component (reads Upstash + DB)
      loading.tsx                            # Inspector Suspense fallback (returns null)
      inspector-store.ts                     # In-memory singleton: responses log, active identity, toggles, seen keys
      inspector-reads.ts                     # readRemainingRows, readLogTail, readUpstashUp server reads
      actions.ts                             # All inspector Server Actions (spamSignIn, spamSignUp, spamReset, resetCounters, etc.)
      _components/
        action-button.tsx                    # Client component: zero-arg Server Action via <form action>
        controls.tsx                         # "Spam X" / "Send one" button panel
        toggles.tsx                          # Failure-mode toggles + distinct-IP runners + timing readout
        remaining-panel.tsx                  # Remaining-tokens table (5 rows: signin ip+email, signup ip, reset ip+email)
        responses-log.tsx                    # Recent-responses log (last 20 action calls)
        log-tail.tsx                         # Structured log tail (last 20 rate_limit_log rows)
        identity-switcher.tsx                # Active identity switcher (alice/bob/unauthenticated)
        upstash-badge.tsx                    # Upstash up/down status badge
        upstash-link.tsx                     # Link to Upstash console
tests/
  lessons/
    Lesson 2.test.ts                         # Placeholder (describe.todo)
    Lesson 3.test.ts                         # Placeholder (describe.todo)
    Lesson 4.test.ts                         # Placeholder (describe.todo)
    Lesson 5.test.ts                         # Placeholder (describe.todo)
drizzle.config.ts                            # Drizzle Kit config (two-schema array, snake_case, unpooled URL)
next.config.ts                               # Next.js config
tsconfig.json                                # TypeScript config
biome.json                                   # Biome linter/formatter config
vitest.config.ts                             # Vitest config
package.json                                 # Dependencies and scripts
.env.example                                 # Env var template
```

---

## Contracts

### `src/env.ts`
```ts
export const env: {
  // server
  DATABASE_URL: string           // z.url()
  DATABASE_URL_UNPOOLED: string  // z.url()
  SEED: number                   // z.coerce.number().default(1)
  BETTER_AUTH_SECRET: string     // z.string().min(32)
  BETTER_AUTH_URL: string        // z.url()
  RESEND_API_KEY: string         // z.string().min(1)
  EMAIL_FROM: string             // z.string().min(1)
  EMAIL_REPLY_TO: string         // z.email()
  UPSTASH_REDIS_REST_URL: string // z.url()
  UPSTASH_REDIS_REST_TOKEN: string // z.string().min(1)
  // client
  NEXT_PUBLIC_APP_NAME: string   // z.string().min(1)
  NEXT_PUBLIC_APP_URL: string    // z.url()
}
```

### `src/proxy.ts`
```ts
export async function proxy(request: NextRequest): Promise<NextResponse>
export const config = { matcher: ['/dashboard/:path*', '/sign-in', '/sign-up'] }
```
Presence-only cookie check via `getSessionCookie`. Redirects unauthenticated requests to `/sign-in?next=…`; redirects authenticated users away from auth pages to `/dashboard`.

### `src/db/index.ts`
```ts
export const db: DrizzleInstance       // primary postgres-js client
export const dbUnpooled: DrizzleInstance // alias (same client locally)
```

### `src/db/columns.ts`
```ts
export const timestamps: {
  createdAt: PgColumn  // timestamp with timezone, precision:3, defaultNow, notNull
}
```

### `src/db/schema.ts`

**Enums:**
```ts
export const suppressionReason: PgEnum<['hard_bounce','soft_bounce_threshold','complaint','manual_unsubscribe']>
export const rateLimitEvent: PgEnum<['rate_limit_rejected','rate_limit_unavailable']>
```

**Tables:**
```
emailSuppressions ('email_suppressions')
  id              uuid PK default uuidv7()
  email           text NOT NULL UNIQUE
  reason          suppressionReason NOT NULL
  providerEventId text
  bypassUntil     timestamp with tz
  metadata        jsonb
  ...timestamps (createdAt)
  updatedAt       timestamp with tz defaultNow NOT NULL

rateLimitLog ('rate_limit_log')
  id        uuid PK default uuidv7()
  event     rateLimitEvent NOT NULL
  limiter   text NOT NULL
  key       text NOT NULL
  remaining integer NOT NULL
  reset     bigint(mode:'number') NOT NULL
  firedAt   timestamp with tz precision:3 defaultNow NOT NULL
```

**Exported types:**
```ts
export type EmailSuppression = typeof emailSuppressions.$inferSelect
export type NewEmailSuppression = typeof emailSuppressions.$inferInsert
export type RateLimitLog = typeof rateLimitLog.$inferSelect
export type NewRateLimitLog = typeof rateLimitLog.$inferInsert
```

### `src/db/schema/auth.ts`
CLI-generated Better Auth schema. Tables: `user`, `session`, `account`, `verification`. Standard Better Auth columns; not student-edited.

### `src/lib/result.ts`
```ts
export type ErrorCode = 'validation'|'conflict'|'not_found'|'unauthorized'|'forbidden'|'rate_limited'|'internal'
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; userMessage: string; fieldErrors?: Record<string, string[]> } }
export const ok: <T>(data: T) => Result<T>
export const err: (code: ErrorCode, userMessage: string, fieldErrors?: Record<string,string[]>) => Result<never>
export const isUniqueViolation: (e: unknown) => boolean
```

### `src/lib/redis.ts`
```ts
export const redis: Redis                        // Redis.fromEnv()
export const pingRedis: () => Promise<boolean>
```

### `src/lib/redis-mock.ts`
```ts
export class UpstashConnectionError extends Error
export const makeDownRedis: () => never   // Proxy whose every method throws UpstashConnectionError
```

### `src/lib/rate-limit.ts`
```ts
export const signInLimiter: Ratelimit  // slidingWindow(10, '1 m'), prefix:'rl:signin', analytics:true
export const signUpLimiter: Ratelimit  // slidingWindow(5, '10 m'), prefix:'rl:signup', analytics:true
export const resetLimiter: Ratelimit   // slidingWindow(3, '15 m'), prefix:'rl:reset', analytics:true
export const LIMITER_MAX = { signin: 10, signup: 5, reset: 3 } as const
```

### `src/lib/safe-limit.ts`
```ts
export type RateLimitResult = Awaited<ReturnType<Ratelimit['limit']>>
export const safeLimit: (limiter: Ratelimit, prefix: string, key: string) => Promise<RateLimitResult>
// On limiter.limit() throw: logs rate_limit_unavailable, returns { success:true, limit:0, remaining:0, reset:0, pending:Promise.resolve() }
```

### `src/lib/keys.ts`
```ts
export const getClientIp: (headers: Headers) => string
// x-forwarded-for first entry → x-real-ip → 'unknown'
export const normalizeEmail: (email: string) => string
// trim + toLowerCase only (no +-alias stripping)
```

### `src/lib/rate-limit-headers.ts`
```ts
export type RateLimitBudget = { limit: number; remaining: number; reset: number }
// reset is delta-seconds: Math.ceil((r.reset - Date.now()) / 1000)

export const rateLimitBudget: (r: RateLimitResult) => RateLimitBudget
export const rateLimitHeaders: (r: RateLimitResult) => Record<string, string>
// Returns { 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset' }

export const rateLimited: (r: RateLimitResult, gate: 'ip'|'email', key: string) => Promise<Result<never>>
// Logs rate_limit_rejected, returns err('rate_limited', 'Too many attempts...')

export const rateLimitedResponse: (r: RateLimitResult) => Response
// JSON 429 with RateLimit-* + Retry-After headers
```

### `src/lib/rate-limit-log.ts`
```ts
export const logRateLimit: (entry: {
  event: 'rate_limit_rejected' | 'rate_limit_unavailable'
  limiter: string
  key: string
  remaining?: number
  reset?: number
}) => Promise<void>
```

### `src/lib/auth.ts`
```ts
export const SESSION_COOKIE_PREFIX: string  // '__Host-better-auth' in prod, 'better-auth' in dev
export const auth: BetterAuth               // betterAuth instance, rateLimit.enabled: false
export const getCurrentUser: () => Promise<User | null>
export const requireUser: (next?: string) => Promise<User>  // redirects to /sign-in if no session
```
Config: emailAndPassword (requireEmailVerification, minPasswordLength:12, autoSignIn:false), emailVerification (sendOnSignUp:true, autoSignInAfterVerification:true, expiresIn:3600), session (expiresIn:30d, freshAge:10m, cookieCache:5m).

### `src/lib/auth-client.ts`
```ts
export const authClient: BetterAuthClient  // createAuthClient(), same-origin
```

### `src/lib/auth/error-mapping.ts`
```ts
export const mapAuthError: (error: unknown) => Result<never>
// statusCode 429 → rate_limited; INVALID_EMAIL_OR_PASSWORD → unauthorized; EMAIL_NOT_VERIFIED → forbidden; else → internal
```

### `src/lib/email.ts`
```ts
export type SendInput = {
  to: string; subject: string; react: ReactNode
  idempotencyKey: string; replyTo?: string; bypassSuppression?: boolean
}
export const getMockEmailSentCount: () => number
export const sendEmail: (input: SendInput) => Promise<Result<{ id: string }>>
// Checks INSPECTOR_MOCK_EMAIL env flag; checks suppression list; calls Resend
```

### `src/lib/suppressions.ts`
```ts
export const isSuppressed: (
  email: string,
  opts: { kind: 'transactional' | 'marketing' }
) => Promise<{ suppressed: boolean; reason?: string; bypassUntil?: Date }>
// manual_unsubscribe does NOT block transactional; bypassUntil overrides suppression
```

### `src/lib/redirects.ts`
```ts
export const safeNext: (raw: unknown) => string | undefined
// Accepts only single-/ paths, rejects //, rejects : (absolute URLs, javascript:)
```

### `src/app/(auth)/sign-in/actions.ts`
```ts
// Schema: { email (email, trim+lower), password (min 1), next? (string) }
export const signInAction: (
  _state: Result<{ redirectTo: string; rateLimit: RateLimitBudget }> | null,
  formData: FormData
) => Promise<Result<{ redirectTo: string; rateLimit: RateLimitBudget }>>
// Gate order: ip → email (both signInLimiter via safeLimit); then auth.api.signInEmail; after(pending) both gates
```

### `src/app/(auth)/sign-up/actions.ts`
```ts
// Schema: { name (min1 max80), email (email), password (min12) }
export const signUpAction: (
  _state: Result<{ redirectTo: string; rateLimit: RateLimitBudget }> | null,
  formData: FormData
) => Promise<Result<{ redirectTo: string; rateLimit: RateLimitBudget }>>
// Gate: ip-only (signUpLimiter); per-email gate omitted (enumeration vector); redirectTo:/verify-email
```

### `src/app/(auth)/reset/actions.ts`
```ts
// Schema: { email (email) }
export const resetAction: (
  _state: Result<{ sent: true }> | null,
  formData: FormData
) => Promise<Result<{ sent: true }>>
// Gate order: ip → email (both resetLimiter via safeLimit); tightest budget (3/15m); enumeration-uniform
```

### `src/app/api/limit-demo/route.ts`
```ts
export const GET: (request: Request) => Promise<Response>
// Calls signInLimiter.limit() bare (no safeLimit); returns RateLimit-* headers on 200; 429 on exhaustion
```

### `src/app/inspector/inspector-store.ts`
```ts
export type InspectorResponse = {
  seq: number; endpoint: 'sign-in'|'sign-up'|'reset'
  outcome: 'ok'|'rate_limited'|'unauthorized'|'validation'|'internal'
  budget?: { limit: number; remaining: number; reset: number }
  key?: string; message: string; ms: number
}
export type ActiveIdentity = 'alice' | 'bob' | 'unauthenticated'
export const IDENTITY_EMAIL: Record<ActiveIdentity, string | null>
export const inspectorState: InspectorState  // globalThis singleton surviving HMR
export const recordSeenKey: (prefix: string, key: string) => void
export const drainSeenKeys: () => { prefix: string; key: string }[]
export const pushResponse: (entry: Omit<InspectorResponse, 'seq'>) => InspectorResponse  // capped at 20
export const clearResponses: () => void
```

### `src/app/inspector/inspector-reads.ts`
```ts
export type RemainingRow = {
  testid: string; prefix: string; key: string
  remaining: number | null; limit: number; resetSeconds: number | null
}
export const readRemainingRows: () => Promise<RemainingRow[]>   // 5 rows: signin ip+email, signup ip, reset ip+email
export const readUpstashUp: () => Promise<boolean>
export const readLogTail: () => Promise<RateLimitLog[]>         // last 20, desc firedAt
```

### `src/app/inspector/actions.ts` (inspector Server Actions)
```ts
export const spamSignIn: () => Promise<void>       // 11× sign-in calls; sets timingMs from rejected tail
export const spamSignUp: () => Promise<void>       // 6× sign-up calls (fresh email each time)
export const spamReset: () => Promise<void>        // 4× reset against eve@example.com, distinct synthetic IPs
export const sendOneSignIn: () => Promise<void>    // single gate-only call for timing demo
export const sendOneSignUp: () => Promise<void>    // single sign-up call
export const sendOneReset: () => Promise<void>     // single reset call to eve@example.com
export const resetCounters: () => Promise<void>    // clears responses, truncates rate_limit_log, resets Redis keys
export const setIdentity: (identity: ActiveIdentity) => Promise<void>
export const toggleForceDown: () => Promise<void>
export const toggleGateAfterWork: () => Promise<void>
export const toggleAwaitPending: () => Promise<void>
export const spoofIpSignIn: () => Promise<void>    // 11× with fresh synthetic ip: keys, same email: key
export const distinctIpReset: () => Promise<void>  // 1× reset with fresh synthetic ip:, exhausted email:eve
```

### `src/app/inspector/_components/action-button.tsx`
```ts
// Client component
type ActionButtonProps = ComponentProps<typeof Button> & { action: () => Promise<void>; children: ReactNode }
export const ActionButton: (props: ActionButtonProps) => JSX.Element
```

### `src/app/inspector/_components/remaining-panel.tsx`
```ts
export const RemainingPanel: ({ rows }: { rows: RemainingRow[] }) => JSX.Element
// data-testid="remaining-panel"; row testids: remaining-row-{signin-ip, signin-email, signup-ip, reset-ip, reset-email}
```

### `src/app/inspector/_components/responses-log.tsx`
```ts
export const ResponsesLog: ({ responses }: { responses: InspectorResponse[] }) => JSX.Element
// data-testid="responses-log"; rows: data-testid="response-row", data-outcome={outcome}
```

### `src/app/inspector/_components/log-tail.tsx`
```ts
export const LogTail: ({ rows }: { rows: RateLimitLog[] }) => JSX.Element
// data-testid="log-tail"; rows: data-testid="log-row", data-event={event}
```

### `src/app/inspector/_components/controls.tsx`
```ts
export const Controls: () => JSX.Element
// data-testid="inspector-controls"; spam/send-one buttons for sign-in, sign-up, reset
```

### `src/app/inspector/_components/toggles.tsx`
```ts
type TogglesProps = { forceDown: boolean; gateAfterWork: boolean; awaitPending: boolean; timingMs: number | null }
export const Toggles: (props: TogglesProps) => JSX.Element
// data-testid="inspector-toggles"; data-testids: force-down-toggle, gate-after-work-toggle, await-pending-toggle, spoof-ip-runner, distinct-ip-reset-runner, timing-readout
```

### `src/app/inspector/_components/identity-switcher.tsx`
```ts
export const IdentitySwitcher: ({ active }: { active: ActiveIdentity }) => JSX.Element
// data-testid="identity-switcher"
```

### `src/app/inspector/_components/upstash-badge.tsx`
```ts
export const UpstashBadge: ({ up }: { up: boolean }) => JSX.Element
// data-testid="upstash-badge", data-up={up}
```

### `src/app/inspector/_components/upstash-link.tsx`
```ts
export const UpstashLink: () => JSX.Element
// data-testid="upstash-link"; href="https://console.upstash.com/ratelimit"
```

### `src/lib/utils.ts`
```ts
export const cn: (...inputs: ClassValue[]) => string
```

### `drizzle.config.ts`
```ts
// schema: ['./src/db/schema.ts', './src/db/schema/auth.ts']
// dialect: 'postgresql', casing: 'snake_case', out: './drizzle'
// dbCredentials.url: DATABASE_URL_UNPOOLED
```

---

## Dependencies

**Runtime:**
| Package | Version |
|---|---|
| next | 16.2.7 |
| react | 19.2.4 |
| react-dom | 19.2.4 |
| better-auth | ^1.6.14 |
| drizzle-orm | ^0.45.1 |
| @upstash/ratelimit | ^2.0.8 |
| @upstash/redis | ^1.38.0 |
| @t3-oss/env-nextjs | ^0.13.11 |
| zod | ^4.4.3 |
| postgres | ^3.4.7 |
| resend | ^6.12.4 |
| react-email | ^6.5.0 |
| server-only | ^0.0.1 |
| sonner | ^2.0.7 |
| next-themes | ^0.4.6 |
| uuidv7 | ^1.0.2 |
| lucide-react | ^1.17.0 |
| radix-ui | ^1.4.3 |
| class-variance-authority | ^0.7.1 |
| clsx | ^2.1.1 |
| tailwind-merge | ^3.6.0 |
| tw-animate-css | ^1.4.0 |

**Dev:**
| Package | Version |
|---|---|
| typescript | ^6.0.3 |
| @biomejs/biome | 2.4.16 |
| tailwindcss | ^4.3.0 |
| drizzle-kit | ^0.31.5 |
| drizzle-zod | ^0.8.0 |
| drizzle-seed | ^0.3.1 |
| vitest | ^4.1.8 |
| tsx | ^4.20.0 |
| dotenv-cli | ^10.0.0 |
| auth | ^1.6.14 |
| babel-plugin-react-compiler | 1.0.0 |

---

## Start diff

The start/ and solution/ trees have identical file lists. All inspector infrastructure, UI components, DB schema, email utilities, auth wiring, and form files are pre-provided and identical between start and solution. The student fills in six stub files:

### `src/env.ts`
**Start:** Missing `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from server schema and runtimeEnv.
**Solution:** Adds both vars (z.url() and z.string().min(1)).
**TODO:** `TODO(L2) — add UPSTASH_REDIS_REST_URL (z.url()) and UPSTASH_REDIS_REST_TOKEN (z.string().min(1)) to server + runtimeEnv.`

### `src/lib/rate-limit.ts`
**Start:** Three inert stubs `{} as unknown as Ratelimit`; `LIMITER_MAX` already exported.
**Solution:** Real `new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(...), prefix, analytics:true, ephemeralCache: new Map() })` for each limiter.
**TODO:** `TODO(L2) — three module-scope Ratelimit instances (signin 10/1m, signup 5/10m, reset 3/15m), each analytics:true + own ephemeralCache + distinct prefix; export LIMITER_MAX. This is the ONLY place new Ratelimit(...) may appear.`

### `src/lib/keys.ts`
**Start:** `getClientIp` always returns `'unknown'`; `normalizeEmail` already correct.
**Solution:** `getClientIp` reads `x-forwarded-for` first entry, then `x-real-ip`, then `'unknown'`.
**TODO:** `TODO(L3) — getClientIp(headers) (x-forwarded-for first, x-real-ip, then 'unknown') and normalizeEmail(email) (trim+lowercase, no +-strip).`

### `src/lib/safe-limit.ts`
**Start:** `RateLimitResult` is a hand-written type; `safeLimit` is an always-pass no-op (returns `{ success:true, … }` without calling the limiter).
**Solution:** `RateLimitResult` inferred from `Ratelimit['limit']`; `safeLimit` calls `limiter.limit(key)`, catches, logs `rate_limit_unavailable`, and returns the fail-open result.
**TODO:** `TODO(L3) — safeLimit(limiter, prefix, key): try limiter.limit(key); catch logs rate_limit_unavailable (limiter: prefix) + returns { success:true, … } (the fail-open knob).`

### `src/lib/rate-limit-headers.ts`
**Start:** `rateLimitBudget` returns zeros; `rateLimitHeaders` returns `{}`; `rateLimited` returns `err(...)` without logging; `rateLimitedResponse` returns 429 without rate-limit headers.
**Solution:** All four functions fully implemented with delta-seconds conversion and logging via `logRateLimit`.
**TODO:** `TODO(L3) — rateLimitBudget (reset→delta-seconds), rateLimitHeaders (route-twin), rateLimited (action reject → err('rate_limited', opaque)), rateLimitedResponse (route-twin 429).`

### `src/app/(auth)/sign-in/actions.ts`
**Start:** Returns `err('internal', 'Not implemented')`.
**Solution:** Full implementation: Zod parse → ip → email gate (both `safeLimit` on `signInLimiter`) → `auth.api.signInEmail` → `after(pending)` both gates → `ok({ redirectTo, rateLimit: rateLimitBudget(ipLimit) })`.
**TODO:** `TODO(L3) — parse; resolve ip+email; safeLimit ip then email before signInEmail (rateLimited on !success); on success ok({ redirectTo, rateLimit: rateLimitBudget(ipLimit) }); after(pending) both gates.`

### `src/app/(auth)/sign-up/actions.ts`
**Start:** Returns `err('internal', 'Not implemented')`.
**Solution:** Zod parse → ip gate only (`signUpLimiter`) → `auth.api.signUpEmail` → `after(pending)` → `ok({ redirectTo: /verify-email, rateLimit })`.
**TODO:** `TODO(L4) — parse; resolve ip; single safeLimit(signUpLimiter, 'ip:'+ip) before signUpEmail (per-IP only); on success ok({ redirectTo:/verify-email, rateLimit }); after(pending).`

### `src/app/(auth)/reset/actions.ts`
**Start:** Returns `err('internal', 'Not implemented')`.
**Solution:** Zod parse → ip → email gate (both `safeLimit` on `resetLimiter`) → `auth.api.requestPasswordReset` → `after(pending)` both → `ok({ sent: true })`.
**TODO:** `TODO(L5) — parse; resolve ip+email; safeLimit ip then email before forgetPassword (per-email survives IP switch); on success ok({ sent: true }); after(pending) both gates.`

All other files (`src/api/limit-demo/route.ts`, inspector files, DB schema, email, UI components) are identical between start and solution — pre-provided, read-only for the student.

The test files (`tests/lessons/Lesson 2–5.test.ts`) are all `describe.todo(...)` placeholders in both start and solution.
