# Chapter 095 — Codebase Summary

## Solution file tree

```
projects/Chapter 095/solution/
├── package.json                                      — package manifest; name "chapter-095-audit-target"
├── next.config.ts                                    — Next.js config: Sentry wiring, security headers, PostHog proxy, lucide-react barrel fix
├── trigger.config.ts                                 — Trigger.dev v4 config: project ref, ./trigger dirs, maxDuration 300s, retry defaults
├── instrumentation.ts                                — Next.js 16 boot hook: lazy-imports Sentry per runtime; exports onRequestError
├── instrumentation-client.ts                         — Client-side Sentry init; exports onRouterTransitionStart
├── sentry.server.config.ts                           — Server Sentry init with redact beforeSend + requestId context injection
├── sentry.edge.config.ts                             — Edge Sentry init (same DSN/release as server)
├── drizzle.config.ts                                 — Drizzle Kit config (DATABASE_URL_UNPOOLED, migrations dir)
├── vitest.config.ts                                  — Vitest config
├── biome.json                                        — Biome linter/formatter config
├── trigger/
│   ├── export-invoices.ts                            — Parent durable task: paginate→CSV, send email child, close exports row in tx
│   ├── paginate-page.ts                              — Child task: fetch one invoice page, return CSV chunk + nextCursor
│   ├── send-export-email.ts                          — Child task: send ExportReadyEmail via sendEmail, return Result (suppression-aware)
│   └── delete-user.ts                                — Reference task: walk data graph, anonymize audit trail, delete user row
├── src/
│   ├── env.ts                                        — @t3-oss/env-nextjs boundary: server + client partition with Sentry, Trigger, Stripe, PostHog vars
│   ├── proxy.ts                                      — Next.js middleware: cookie redirects, CSP nonce, request-correlation id via runWithContext
│   ├── app/
│   │   ├── layout.tsx                                — Root layout: Providers wrapper
│   │   ├── globals.css                               — Tailwind base styles
│   │   ├── _components/
│   │   │   ├── providers.tsx                         — ConsentProvider + PostHogGate (dynamic import, two-belt consent) + ThemeProvider
│   │   │   ├── consent-provider.tsx                  — ConsentContext: analytics/decided state, accept/reject routed through consent.ts
│   │   │   ├── consent-banner.tsx                    — Cookie-consent banner: Accept/Reject equal-weight buttons, hides when decided
│   │   │   ├── submit-button.tsx                     — Form submit button with pending state
│   │   │   └── field-error.tsx                       — Field-level error display
│   │   ├── (marketing)/
│   │   │   ├── layout.tsx                            — Marketing layout
│   │   │   └── page.tsx                              — Marketing homepage
│   │   ├── (auth)/
│   │   │   ├── sign-in/{page,sign-in-form,actions,loading}.tsx/ts — Sign-in route
│   │   │   ├── sign-up/{page,sign-up-form,actions}.tsx/ts         — Sign-up route
│   │   │   ├── verify-email/{page,verify-email-resend,loading}.tsx — Email verification route
│   │   │   └── accept-invite/{page,accept-form,loading}.tsx        — Invitation acceptance route
│   │   ├── onboarding/create-org/page.tsx            — Org creation onboarding page
│   │   ├── (protected)/
│   │   │   ├── layout.tsx                            — Protected layout (session guard)
│   │   │   ├── dashboard/{page,loading}.tsx          — Dashboard: seeded N+1 (finding 8) + RSC waterfall (finding 5)
│   │   │   ├── invoices/{page,loading}.tsx           — Invoice list page
│   │   │   ├── invoices/[id]/{page,notes,loading}.tsx — Invoice detail + notes (XSS-safe plain-text render)
│   │   │   └── settings/{page,actions,resend-test,loading}.tsx — Settings: sendResendTest action, ResendClientTest component
│   │   └── api/
│   │       ├── auth/[...all]/route.ts                — Better Auth catch-all handler
│   │       ├── auth/reset-password/route.ts          — Password reset route (dual rate-limit gate)
│   │       ├── exports/trigger/route.ts              — SEEDED #10: bare limiter.limit() bypasses safeLimit fail-open seam
│   │       ├── exports/[runId]/route.ts              — Run-state poller: returns status/metadata/attemptCount/completedAt/error
│   │       ├── test/throw/route.ts                   — Test route to verify Sentry captures uncaught errors
│   │       └── webhooks/stripe/route.ts              — Stripe webhook ingress: verify sig, claimEvent, dispatch; runWithContext correlation
│   ├── db/
│   │   ├── index.ts                                  — Drizzle postgres client + Transaction type export
│   │   ├── columns.ts                                — Shared column helpers (timestamps)
│   │   ├── schema.ts                                 — App tables: emailSuppressions, customers, invoices, invoiceNotes, exports, rateLimitLog, processedEvents, planEntitlements
│   │   ├── schema/auth.ts                            — Better Auth generated schema (user, session, organization, member, invitation, …)
│   │   ├── audit.ts                                  — auditLogs table + RLS policies (no UPDATE/DELETE) + AuditEvent type
│   │   ├── audit-log.ts                              — logAudit(): session path + ExplicitAuditEvent path (webhook/task)
│   │   ├── tenant.ts                                 — tenantDb(orgId): scoped query/insert/update/delete + withTenant transaction
│   │   └── queries/
│   │       ├── invoices.ts                           — listInvoices (cursor pagination) + countInvoices
│   │       ├── invoices-with-customer.ts             — SEEDED #8: N+1 loop (listInvoicesWithCustomer)
│   │       ├── invoice-notes.ts                      — Invoice notes queries
│   │       ├── invitations.ts                        — Invitation queries
│   │       ├── members.ts                            — listMembers
│   │       ├── organizations.ts                      — getOrganization
│   │       ├── entitlements.ts                       — getEntitlement
│   │       └── audit.ts                              — Audit log queries
│   ├── emails/
│   │   ├── ExportReadyEmail.tsx                      — Export-ready notification email (orgName, rowCount, downloadUrl)
│   │   ├── invite.tsx                                — Invitation email
│   │   ├── welcome-verification.tsx                  — Welcome/verify email
│   │   ├── email-tailwind-config.ts                  — Shared Tailwind config for email components
│   │   └── components/email-layout.tsx               — Shared email layout wrapper
│   ├── components/ui/                                — shadcn/ui primitives (button, card, badge, input, label, select, skeleton, sonner, separator, progress)
│   └── lib/
│       ├── auth.ts                                   — Better Auth server instance + requireOrgUser helper
│       ├── auth-client.ts                            — Better Auth client instance
│       ├── auth-schema.config.ts                     — Better Auth schema config
│       ├── email.ts                                  — sendEmail(): suppression check + Resend send, returns Result
│       ├── redis.ts                                  — Upstash Redis client (Redis.fromEnv())
│       ├── result.ts                                 — Result<T> type + ok/err helpers + isUniqueViolation
│       ├── problem.ts                                — problemJson() RFC 7807 response helper
│       ├── utils.ts                                  — cn() class merger
│       ├── redirects.ts                              — Redirect helpers
│       ├── suppressions.ts                           — isSuppressed(): email suppression list read (transactional/marketing kind)
│       ├── trigger-client.ts                         — retrieveRun() + listRunsForOrg() wrappers over Trigger.dev REST API
│       ├── rate-limit.ts                             — signInLimiter, signUpLimiter, resetLimiter, resetEmailLimiter + LIMITER_MAX constants
│       ├── safe-limit.ts                             — safeLimit(): fail-open wrapper over Ratelimit; logs unavailable on Redis outage
│       ├── rate-limit-log.ts                         — logRateLimit(): writes rate_limit_log row
│       ├── rate-limit-headers.ts                     — Adds RateLimit-* response headers
│       ├── logger.ts                                 — pino logger with redact seam + requestId mixin via AsyncLocalStorage
│       ├── request-context.ts                        — AsyncLocalStorage context: RequestContext type, runWithContext, getRequestContext
│       ├── auth/
│       │   ├── roles.ts                              — Role type + ROLE_RANK + roleAtLeast()
│       │   ├── authed-action.ts                      — authedAction(): resolve→authorize→parse→call Server Action wrapper
│       │   ├── require-role.ts                       — requireRole() helper (throws on insufficient role)
│       │   └── error-mapping.ts                      — Auth error code → user message mapping
│       ├── exports/
│       │   ├── start.ts                              — startExport Server Action: insert queued row, tasks.trigger fire-and-forget, update runId
│       │   ├── to-csv.ts                             — rowsToCsv(): Invoice[] → RFC-4180 CSV string
│       │   ├── day-bucket.ts                         — dayBucket(): YYYY-MM-DD UTC string for daily idempotency key
│       │   └── errors.ts                             — ExportError class (code: EMPTY_RESULTSET | UNKNOWN_PLAN)
│       ├── analytics/
│       │   └── consent.ts                            — grantAnalyticsConsent, revokeAnalyticsConsent, hasAnalyticsConsentCookie, ANALYTICS_CONSENT_COOKIE
│       ├── billing/
│       │   ├── index.ts                              — Billing module re-exports
│       │   ├── stripe.ts                             — Stripe client instance
│       │   ├── catalog.ts + catalog.json             — Plan catalog types and data
│       │   ├── projection.ts                         — Billing projection helpers
│       │   ├── billing-error.ts                      — BillingError class
│       │   ├── upgrade.ts                            — Upgrade action
│       │   ├── portal.ts                             — Stripe billing portal action
│       │   ├── require-plan.ts                       — requirePlan() guard
│       │   └── transfer-ownership.ts                 — Transfer org ownership (billing side)
│       ├── webhooks/
│       │   ├── stripe.ts                             — dispatch(): maps Stripe event type → handler
│       │   └── processed-events.ts                   — claimEvent(): idempotency ledger claim
│       ├── invitations/
│       │   ├── send.ts                               — sendInvitation()
│       │   ├── accept.ts                             — acceptInvitation()
│       │   ├── manage.ts                             — Invitation management actions
│       │   └── url.ts                                — Invitation URL builder/verifier
│       ├── admin/
│       │   └── transfer-ownership.ts                 — Admin transfer ownership
│       └── account/
│           └── delete-account.ts                     — deleteAccount() (seeded simple version; deleteUser task is the healthy shape)
└── tests/lessons/
    ├── Lesson 2.test.ts                              — describe.todo: finding 007 (missing preload on LCP image)
    ├── Lesson 3.test.ts                              — describe.todo: finding 001 (Sentry not wired)
    ├── Lesson 4.test.ts                              — describe.todo: findings 002 & 003 (log secret leak + missing correlation id)
    ├── Lesson 5.test.ts                              — describe.todo: finding 004 (PostHog consent gate)
    ├── Lesson 6.test.ts                              — describe.todo: findings 005/006/008 (waterfall + barrel + N+1)
    └── Lesson 7.test.ts                              — describe.todo: SUMMARY.md + out-of-scope.md + bonus findings 9 & 10
```

## Contracts

### trigger/export-invoices.ts
```ts
export const exportQueue: Queue  // { name: 'export', concurrencyLimit: 1 }

export const exportInvoices: SchemaTask<
  { organizationId: string; requestedBy: string },
  { ok: true; runId: string; rowCount: number }
>
// id: 'export-invoices'; queue: exportQueue; retry.maxAttempts: 3
// Payload: z.strictObject({ organizationId: z.string().min(1), requestedBy: z.string().min(1) })
// Side effects in order: paginate pages via paginatePage.triggerAndWait (idempotency-keyed per page),
//   send email via sendExportEmail.triggerAndWait (idempotency-keyed [orgId,'export-email']),
//   close exports row + write audit in one tenantDb.transaction
// metadata keys: 'pagesTotal', 'pagesDone', 'downloadUrl'
```

### trigger/paginate-page.ts
```ts
export const paginatePage: SchemaTask<
  { organizationId: string; page: number; cursor: string | null },
  { csv: string; nextCursor: string | null; rowCount: number }
>
// id: 'paginate-page'; pageSize: 500
```

### trigger/send-export-email.ts
```ts
export const sendExportEmail: SchemaTask<
  { organizationId: string; recipientUserId: string; rowCount: number; downloadUrl: string },
  Result<{ id: string }>
>
// id: 'send-export-email'; suppression is an ok Result (not a throw)
```

### trigger/delete-user.ts
```ts
export const deleteUser: SchemaTask<{ userId: string }, void>
// id: 'delete-user'; reference implementation only; deletes invitation, invoiceNotes, exports, member rows;
// anonymizes auditLogs (sets actorUserId/actorIp/actorUserAgent null); deletes user row
```

### src/env.ts
Server vars: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `SEED`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `INVITATION_SIGNING_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `STRIPE_SECRET_KEY` (startsWith `sk_test_`), `STRIPE_WEBHOOK_SECRET` (startsWith `whsec_`), `STRIPE_PORTAL_RETURN_URL`, `TRIGGER_SECRET_KEY` (startsWith `tr_`), `TRIGGER_PROJECT_REF` (startsWith `proj_`), `APP_URL`, `SENTRY_AUTH_TOKEN?`, `SENTRY_ORG?`, `SENTRY_PROJECT?`, `SENTRY_RELEASE` (default: VERCEL_GIT_COMMIT_SHA ?? 'dev')

Client vars: `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_SENTRY_DSN?`

### src/db/schema.ts — tables
| Table | Key columns |
|---|---|
| `emailSuppressions` | id uuid PK, email text unique, reason enum(hard_bounce/soft_bounce_threshold/complaint/manual_unsubscribe), providerEventId?, bypassUntil?, metadata jsonb |
| `customers` | id uuid PK (uuidv7), organizationId text FK→organization, name text, email text |
| `invoices` | id uuid PK (uuidv7), organizationId text FK, customerId uuid FK→customers, number text, customerName text, status enum(draft/sent/paid/overdue), total numeric, currency text, createdAt timestamp, dueAt? |
| `invoiceNotes` | id uuid PK (uuidv7), invoiceId uuid FK, organizationId text FK, authorId text? FK→user, body text, createdAt |
| `exports` | id uuid PK (uuidv7), organizationId text FK, requestedBy text FK→user, status enum(queued/running/completed/failed) default queued, runId text?, rowCount int?, idempotencyKey?, dayBucket text, pagesDone int?, pagesTotal int?, downloadUrl?, requestedAt, completedAt?; unique index on (organizationId, requestedBy, dayBucket) |
| `rateLimitLog` | id uuid PK, event enum(rate_limit_rejected/rate_limit_unavailable), limiter text, key text, remaining int, reset bigint, firedAt |
| `processedEvents` | id bigint PK identity, provider text, eventId text, eventType text, receivedAt; unique(provider, eventId) |
| `planEntitlements` | organizationId text PK FK, plan enum(free/pro/team) default free, status enum(trialing/active/past_due/canceled/incomplete) default active, subscriptionId?, currentPeriodEnd?, cancelAtPeriodEnd bool default false, seats int default 1, lastEventAt?, updatedAt |

Exported types: `EmailSuppression`, `NewEmailSuppression`, `Customer`, `NewCustomer`, `Invoice`, `NewInvoice`, `InvoiceNote`, `NewInvoiceNote`, `ExportRow`, `NewExportRow`, `RateLimitLog`, `ProcessedEvent`, `PlanEntitlement`

Relations: `invoicesRelations` (invoice → one customer), `customersRelations` (customer → many invoices)

### src/db/audit.ts — table
`auditLogs`: id uuid PK (uuidv7), organizationId text FK, actorUserId text? FK→user (set null), actorIp text?, actorUserAgent text?, action text, subjectType text, subjectId text, payload jsonb, createdAt. RLS enabled; permissive SELECT/INSERT policy (org_id setting), restrictive deny UPDATE/deny DELETE.

```ts
export type AuditLog, NewAuditLog, AuditEvent
```

### src/db/audit-log.ts
```ts
export type ExplicitAuditEvent = AuditEvent & { organizationId: string; actorUserId: string | null }
export const logAudit = async (tx: Transaction, event: AuditEvent | ExplicitAuditEvent): Promise<void>
```

### src/db/tenant.ts
```ts
export const withTenant = async <T>(orgId: string, fn: (tx: Transaction) => Promise<T>): Promise<T>
// Sets app.org_id transaction-local before running fn

export const tenantDb = (orgId: string) => {
  query: { member, invitation, invoices, exports }  // findMany/findFirst with org predicate as outer AND
  insert: <T extends TenantTable>(table) => { values(value: Omit<T['$inferInsert'], 'organizationId'>) }
  update: <T extends TenantTable>(table) => { set(value) => { where(where?) } }
  delete: <T extends TenantTable>(table) => { where(where?) }
  transaction: <T>(fn: (tx: Transaction) => Promise<T>): Promise<T>  // delegates to withTenant
}
```

### src/db/queries/invoices.ts
```ts
export type InvoiceView = 'active'
export type ListInvoicesArgs = { orgId: string; view: InvoiceView; cursor: string | null; pageSize?: number }
export type ListInvoicesResult = { rows: Invoice[]; nextCursor: string | null }
export const listInvoices = async (args: ListInvoicesArgs): Promise<ListInvoicesResult>
export const countInvoices = async ({ orgId: string }): Promise<number>
```

### src/db/queries/invoices-with-customer.ts
```ts
export type InvoiceWithCustomer = Invoice & { customer: Customer | null }
export const listInvoicesWithCustomer = async ({ orgId: string; limit?: number }): Promise<InvoiceWithCustomer[]>
// SEEDED #8: N+1 loop — 1 query for invoices + N queries for customers
```

### src/lib/result.ts
```ts
export type ErrorCode = 'validation' | 'conflict' | 'not_found' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'internal'
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; userMessage: string; fieldErrors?: Record<string, string[]> } }
export const ok = <T>(data: T): Result<T>
export const err = (code: ErrorCode, userMessage: string, fieldErrors?: Record<string, string[]>): Result<never>
export const isUniqueViolation = (e: unknown): boolean
```

### src/lib/auth/authed-action.ts
```ts
export type AuthedCtx = { user: OrgUser; orgId: string; role: Role; db: ReturnType<typeof tenantDb>; ip: string | null; userAgent: string | null }
export const authedAction = <TSchema, TOut>(
  role: Role,
  schema: TSchema,
  fn: (input: z.infer<TSchema>, ctx: AuthedCtx) => Promise<Result<TOut>>
) => async (_prev: Result<TOut> | null, formData: FormData) => Promise<Result<TOut>>
```

### src/lib/auth/roles.ts
```ts
export type Role = 'owner' | 'admin' | 'member'
export const ROLE_RANK: Record<Role, number>  // member:0, admin:1, owner:2
export const roleAtLeast = (role: Role, required: Role): boolean
```

### src/lib/exports/start.ts
```ts
export const startExport: ServerAction  // authedAction('member', z.strictObject({}), ...)
// Returns Result<{ runId: string }>
// Inserts queued exports row, fires tasks.trigger('export-invoices') with concurrencyKey+idempotencyKey+24h TTL, updates row with runId
```

### src/lib/exports/to-csv.ts
```ts
const COLUMNS = ['id','number','customerName','status','total','currency','createdAt','dueAt'] as const
export const rowsToCsv = (rows: Invoice[]): string  // RFC-4180, CRLF line endings
```

### src/lib/exports/day-bucket.ts
```ts
export const dayBucket = (): string  // YYYY-MM-DD UTC
```

### src/lib/exports/errors.ts
```ts
export class ExportError extends Error {
  override readonly name = 'ExportError'
  readonly code: 'EMPTY_RESULTSET' | 'UNKNOWN_PLAN'
  constructor(code, message)
}
```

### src/lib/email.ts
```ts
export type SendInput = { to: string; subject: string; react: ReactNode; idempotencyKey: string; replyTo?: string; bypassSuppression?: boolean }
export const sendEmail = async (input: SendInput): Promise<Result<{ id: string }>>
// Normalizes to, checks isSuppressed, sends via Resend, returns Result
```

### src/lib/suppressions.ts
```ts
export const isSuppressed = async (email: string, opts: { kind: 'transactional' | 'marketing' }): Promise<{ suppressed: boolean; reason?: string; bypassUntil?: Date }>
// manual_unsubscribe never blocks transactional; bypassUntil window overrides suppression
```

### src/lib/trigger-client.ts
```ts
export type RunState = { status: string; metadata: Record<string, unknown>; output: unknown; attemptCount: number; completedAt: Date | null; error: { message: string } | null }
export const retrieveRun = async (runId: string): Promise<RunState>
export const listRunsForOrg = async (orgId: string): Promise<{ id: string; status: string; tags: string[] }[]>
```

### src/lib/rate-limit.ts
```ts
export const signInLimiter: Ratelimit   // slidingWindow(10, '1 m'), prefix 'rl:signin'
export const signUpLimiter: Ratelimit   // slidingWindow(5, '10 m'), prefix 'rl:signup'
export const resetLimiter: Ratelimit    // slidingWindow(3, '15 m'), prefix 'rl:reset'
export const resetEmailLimiter: Ratelimit  // slidingWindow(2, '15 m'), prefix 'rl:reset:email'
export const LIMITER_MAX = { signin: 10, signup: 5, reset: 3 } as const
```

### src/lib/safe-limit.ts
```ts
export type RateLimitResult = Awaited<ReturnType<Ratelimit['limit']>>
export const safeLimit = async (limiter: Ratelimit, prefix: string, key: string): Promise<RateLimitResult>
// Fail-open: catches Redis outage, logs rate_limit_unavailable, returns success:true
```

### src/lib/logger.ts
```ts
export const redact = <T>(payload: T): T
// Deep-walks payload, replaces values under DROP_KEYS/PII_KEYS/'*_key'/'*_secret' with '[REDACTED]'
export const logger: pino.Logger
// formatters.log applies redact; mixin: () => getRequestContext() ?? {}
```

### src/lib/request-context.ts
```ts
export type RequestContext = { requestId: string; userId?: string; orgId?: string }
export const runWithContext = <T>(context: RequestContext, fn: () => T): T
export const getRequestContext = (): RequestContext | undefined
```

### src/lib/analytics/consent.ts
```ts
export const ANALYTICS_CONSENT_COOKIE = 'consent_analytics'
export const hasAnalyticsConsentCookie = (): boolean
export const grantAnalyticsConsent = async (): Promise<void>   // opt_in_capturing + capture event
export const revokeAnalyticsConsent = async (): Promise<void>  // opt_out_capturing + reset
```

### src/app/_components/consent-provider.tsx
```ts
type ConsentValue = { analytics: boolean; decided: boolean; accept: () => Promise<void>; reject: () => Promise<void> }
export const ConsentProvider: React.FC<{ children: ReactNode }>
export const useConsent: () => ConsentValue
```

### src/app/_components/consent-banner.tsx
```ts
export const ConsentBanner: React.FC  // shows while !decided; calls useConsent().accept/reject
```

### src/app/_components/providers.tsx
```ts
export const Providers: React.FC<{ children: ReactNode }>
// ConsentProvider > PostHogGate (dynamic import, opt_out_capturing_by_default: true) > ThemeProvider > ConsentBanner
```

### src/emails/ExportReadyEmail.tsx
```ts
export type ExportReadyEmailProps = { orgName: string; rowCount: number; downloadUrl: string }
const ExportReadyEmail: React.FC<ExportReadyEmailProps>  // default export
// PreviewProps: { orgName: 'Acme', rowCount: 245, downloadUrl: 'https://example.com/exports/run_abc123.csv' }
```

### src/app/api/exports/[runId]/route.ts
```ts
export const GET: (request, { params }) => Promise<Response>
// Returns { status, metadata, attemptCount, completedAt, error } or 502
```

### src/app/api/exports/trigger/route.ts
```ts
export const POST: (request) => Promise<Response>
// SEEDED #10: calls signInLimiter.limit(key) directly (bypasses safeLimit fail-open seam)
```

### src/app/(protected)/settings/actions.ts
```ts
export const sendResendTest = async (): Promise<Result<{ id: string }>>
```

### trigger.config.ts (verbatim)
```ts
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_placeholder',
  dirs: ['./trigger'],
  runtime: 'node',
  maxDuration: 300,
  retries: { default: { maxAttempts: 3, factor: 1.8, minTimeoutInMs: 1000, maxTimeoutInMs: 60_000, randomize: true } },
})
```

## Dependencies

### Production
| Package | Version |
|---|---|
| `@sentry/nextjs` | ^10.57.0 |
| `@t3-oss/env-nextjs` | ^0.13.11 |
| `@trigger.dev/sdk` | ^4.4.0 |
| `@upstash/ratelimit` | ^2.0.8 |
| `@upstash/redis` | ^1.38.0 |
| `@vercel/analytics` | ^2.0.1 |
| `@vercel/speed-insights` | ^2.0.0 |
| `better-auth` | ^1.6.14 |
| `class-variance-authority` | ^0.7.1 |
| `clsx` | ^2.1.1 |
| `drizzle-orm` | ^0.45.1 |
| `lucide-react` | ^1.17.0 |
| `next` | 16.2.7 |
| `next-themes` | ^0.4.6 |
| `pino` | ^9.14.0 |
| `postgres` | ^3.4.7 |
| `posthog-js` | ^1.386.6 |
| `radix-ui` | ^1.4.3 |
| `react` | 19.2.4 |
| `react-dom` | 19.2.4 |
| `react-email` | ^6.5.0 |
| `resend` | ^6.12.4 |
| `server-only` | ^0.0.1 |
| `sonner` | ^2.0.7 |
| `stripe` | ^22.2.0 |
| `tailwind-merge` | ^3.6.0 |
| `tw-animate-css` | ^1.4.0 |
| `uuidv7` | ^1.0.2 |
| `zod` | ^4.4.3 |

### Dev
| Package | Version |
|---|---|
| `@biomejs/biome` | 2.4.16 |
| `@react-email/ui` | ^6.5.0 |
| `@tailwindcss/postcss` | ^4.3.0 |
| `babel-plugin-react-compiler` | 1.0.0 |
| `drizzle-kit` | ^0.31.5 |
| `drizzle-seed` | ^0.3.1 |
| `drizzle-zod` | ^0.8.0 |
| `tailwindcss` | ^4.3.0 |
| `trigger.dev` | ^4.4.0 |
| `tsx` | ^4.20.0 |
| `typescript` | ^6.0.3 |
| `vitest` | ^4.1.8 |

## Start diff

The start and solution share the same file tree except for the following:

### Files present only in solution
- `instrumentation.ts` — Sentry boot hook (register + onRequestError). Start has none (finding 1 gap).
- `instrumentation-client.ts` — Client Sentry init. Start has none.
- `sentry.server.config.ts` — Server Sentry init with redact + requestId. Start has none.
- `sentry.edge.config.ts` — Edge Sentry init. Start has none.
- `src/lib/request-context.ts` — AsyncLocalStorage RequestContext. Start has none (finding 3 gap).
- `src/lib/logger.ts` (enriched) — Solution adds `redact` export + `mixin` over `getRequestContext()`. Start version has no redact, no mixin, only bare `pino({})`.
- `src/lib/analytics/consent.ts` — Consent seam. Start has none (finding 4 gap).
- `src/app/_components/consent-provider.tsx` — ConsentContext. Start has none.
- `src/app/_components/consent-banner.tsx` — Consent banner. Start has none.

### Files that differ between start and solution

**`next.config.ts`** — Start exports bare `nextConfig` with no Sentry wrapping and no `optimizePackageImports`. Solution wraps with `withSentryConfig(nextConfig, {…})` and adds `experimental: { optimizePackageImports: ['lucide-react'] }`.

**`src/env.ts`** — Start lacks Sentry env vars (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_RELEASE`, `NEXT_PUBLIC_SENTRY_DSN`). Solution adds all five.

**`src/proxy.ts`** — Start does not import `uuidv7` or `runWithContext`. Solution adds correlation-id minting (`uuidv7()` or from `x-request-id` header), wraps handler in `runWithContext({ requestId }, ...)`, and echoes `x-request-id` on all response paths.

**`src/app/_components/providers.tsx`** — Start is a single `Providers` component: initializes PostHog eagerly with `opt_out_capturing_by_default: false` (seeded defect #4). Solution replaces it with `ConsentProvider > PostHogGate` (dynamic import, belt-one `opt_out_capturing_by_default: true`, session continuity via `hasAnalyticsConsentCookie`).

**`src/app/api/webhooks/stripe/route.ts`** — Start does not mint/recover a `requestId` and has no `runWithContext` scope (TODO comment present). Solution imports `uuidv7` + `runWithContext`, mints/recovers `x-request-id`, and wraps the handler.

### TODO comments in start

| File | TODO |
|---|---|
| `src/env.ts` | `TODO(L3)` — add Sentry build keys (auth token, org, project, release, NEXT_PUBLIC_SENTRY_DSN) to env schema |
| `next.config.ts` | `TODO(L3)` — wire Sentry: three config files + instrumentation hook + wrap with `withSentryConfig` |
| `next.config.ts` | `TODO(L6)` — add `lucide-react` to `optimizePackageImports` (finding 6 barrel fix) |
| `src/proxy.ts` | `TODO(L4)` — mint/echo `x-request-id` header, open `runWithContext` scope in proxy |
| `src/lib/logger.ts` | `TODO(L4)` — add `redact` scrubbing seam + `requestId` mixin via AsyncLocalStorage |
| `src/app/_components/providers.tsx` | `TODO(L5)` — gate PostHog: dynamic import + `opt_out_capturing_by_default: true` + route through `lib/analytics/consent.ts` |
| `src/app/api/webhooks/stripe/route.ts` | `TODO(L4)` — recover `x-request-id` from request and open `runWithContext` scope |

All test files (`tests/lessons/Lesson *.test.ts`) are `describe.todo(…)` in both start and solution — the student fills the implementations.
