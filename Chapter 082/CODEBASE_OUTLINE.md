# Chapter 082 — Codebase Summary

## Solution file tree

```
projects/Chapter 082/solution/
├── package.json                                  — deps; name: "chapter-082-audit-target"
├── next.config.ts                                — static security headers (SEEDED DEFECT #4: no CSP)
├── drizzle.config.ts                             — three-file schema array; snake_case; unpooled URL
├── trigger.config.ts                             — Trigger.dev v4; maxDuration 300s; dirs: ./trigger
├── vitest.config.ts                              — test runner config
├── biome.json                                    — linter/formatter config
├── tsconfig.json                                 — TS config
├── .env / .env.example                          — local env overrides
├── findings/                                     — student deliverable: the audit report
│   ├── template.md                               — finding report template (4 sections)
│   ├── 001-fail-closed.md                        — Finding 001: fail-open try/catch on requireRole
│   ├── 002-xss-html-sink.md                      — Finding 002: dangerouslySetInnerHTML on invoice notes
│   ├── 003-audit-log-ownership-transfer.md       — Finding 003: missing audit row on billing ownership transfer
│   ├── 004-csp-header.md                         — Finding 004: CSP header absent from next.config.ts
│   ├── 005-secret-next-public.md                 — Finding 005: RESEND_API_KEY in NEXT_PUBLIC_* client bundle
│   ├── 006-rate-limit-password-reset.md          — Finding 006: no rate limit on /api/auth/reset-password
│   ├── 007-dep-hygiene.md                        — Finding 007: pnpm-workspace.yaml missing hygiene settings
│   ├── 008-gdpr-deletion.md                      — Finding 008: deleteAccount deletes only the users row
│   ├── out-of-scope.md                           — off-category observations (duplicate transfer logic)
│   └── SUMMARY.md                                — coverage scorecard; bonus findings 9 (consent) and 10 (safeLimit)
├── trigger/
│   ├── export-invoices.ts                        — parent task; paginate → email → close exports row
│   ├── paginate-page.ts                          — per-page child; reads invoices, returns CSV chunk
│   ├── send-export-email.ts                      — email child; tenant-scoped member lookup + sendEmail
│   └── delete-user.ts                            — healthy GDPR deletion job (reference impl for finding 8)
├── tests/lessons/
│   ├── Lesson 2.test.ts                          — describe.todo gate for finding 001
│   ├── Lesson 3.test.ts                          — describe.todo gate for finding 002
│   ├── Lesson 4.test.ts                          — describe.todo gate for finding 003
│   ├── Lesson 5.test.ts                          — describe.todo gate for finding 004
│   ├── Lesson 6.test.ts                          — describe.todo gate for finding 005
│   ├── Lesson 7.test.ts                          — describe.todo gate for finding 006
│   ├── Lesson 8.test.ts                          — describe.todo gate for finding 007
│   ├── Lesson 9.test.ts                          — describe.todo gate for finding 008
│   └── Lesson 10.test.ts                         — describe.todo gate for summary + bonus findings
├── scripts/
│   ├── seed.ts                                   — DB seed (plants XSS note row; suppression rows)
│   └── test-lesson.mjs                           — per-lesson vitest runner
└── src/
    ├── env.ts                                    — t3-oss/env-nextjs; SEEDED DEFECT #5: NEXT_PUBLIC_RESEND_API_KEY
    ├── proxy.ts                                  — edge middleware; presence-only cookie guard (SEEDED DEFECT #4: no nonce)
    ├── db/
    │   ├── index.ts                              — drizzle client; exports db, dbUnpooled, Transaction type
    │   ├── columns.ts                            — shared timestamps spread (createdAt, precision:3)
    │   ├── schema.ts                             — app tables: emailSuppressions, invoices, exports, invoiceNotes, rateLimitLog, processedEvents, planEntitlements
    │   ├── audit.ts                              — auditLogs table with RLS (permissive isolation + restrictive no-update/delete); AuditEvent type
    │   ├── audit-log.ts                          — logAudit(tx, AuditEvent | ExplicitAuditEvent); ExplicitAuditEvent type
    │   ├── tenant.ts                             — withTenant (SET LOCAL app.org_id) + tenantDb facade (query/insert/update/delete/transaction)
    │   └── queries/
    │       ├── audit.ts                          — auditLogCount, recentAuditLogs (reads via withTenant)
    │       ├── members.ts                        — listMembers(orgId)
    │       ├── organizations.ts                  — getOrgWithOwnerEmail, setStripeCustomerId
    │       ├── invoices.ts                       — listInvoices(cursor pagination), countInvoices
    │       ├── invoice-notes.ts                  — getInvoiceWithNotes(orgId, invoiceId)
    │       ├── entitlements.ts                   — getEntitlement (React.cache), hasActiveAccess
    │       └── invitations.ts                    — getInvitationById
    ├── lib/
    │   ├── auth.ts                               — betterAuth instance; getCurrentUser, requireUser, requireOrgUser; SESSION_COOKIE_PREFIX, INVITATION_TTL_SECONDS
    │   ├── auth-client.ts                        — createAuthClient with organizationClient plugin
    │   ├── auth-schema.config.ts                 — CLI-only mirror of auth.ts (server-only-free for auth:generate)
    │   ├── result.ts                             — Result<T>, ErrorCode, ok(), err(), isUniqueViolation()
    │   ├── logger.ts                             — pino instance; level from LOG_LEVEL
    │   ├── problem.ts                            — problemJson(status, title) → RFC 9457 response
    │   ├── redirects.ts                          — safeNext(raw) open-redirect guard
    │   ├── suppressions.ts                       — isSuppressed(email, {kind}) — reads emailSuppressions
    │   ├── email.ts                              — sendEmail(SendInput) → Result<{id}>; suppression check at edge
    │   ├── redis.ts                              — Redis.fromEnv(); pingRedis()
    │   ├── rate-limit.ts                         — signInLimiter (10/1m), signUpLimiter (5/10m), resetLimiter (3/15m); LIMITER_MAX
    │   ├── safe-limit.ts                         — safeLimit(limiter, prefix, key) fail-open wrapper; RateLimitResult type
    │   ├── rate-limit-log.ts                     — logRateLimit(entry) — writes rateLimitLog row
    │   ├── rate-limit-headers.ts                 — rateLimitBudget, rateLimitHeaders, rateLimited, rateLimitedResponse
    │   ├── trigger-client.ts                     — retrieveRun, listRunsForOrg; RunState type
    │   ├── auth/
    │   │   ├── roles.ts                          — Role type, ROLE_RANK, roleAtLeast
    │   │   ├── error-mapping.ts                  — mapAuthError(error) → Result<never>
    │   │   ├── require-role.ts                   — requireRole(required) throws on below-role actor
    │   │   └── authed-action.ts                  — authedAction(role, schema, fn): resolve→authorize→parse→call; AuthedCtx type
    │   ├── invitations/
    │   │   ├── url.ts                            — generateInviteToken, signedInviteUrl, verifyInviteSignature, sha256
    │   │   ├── send.ts                           — sendInvitation Server Action (authedAction 'admin')
    │   │   ├── accept.ts                         — acceptInvitation Server Action (capability-auth; co-tx insert+status+emailVerified+audit)
    │   │   └── manage.ts                         — changeMemberRole Server Action (authedAction 'admin')
    │   ├── exports/
    │   │   ├── day-bucket.ts                     — dayBucket(): YYYY-MM-DD UTC string
    │   │   ├── errors.ts                         — ExportError class; codes: EMPTY_RESULTSET | UNKNOWN_PLAN
    │   │   ├── to-csv.ts                         — rowsToCsv(rows): RFC-4180 CSV string
    │   │   └── start.ts                          — startExport Server Action (authedAction 'member'); fire-and-forget trigger
    │   ├── billing/
    │   │   ├── billing-error.ts                  — BillingError class; codes: no_access | plan_required | no_customer | unknown_customer | unknown_plan
    │   │   ├── catalog.json                      — lookup_key → plan slug map
    │   │   ├── catalog.ts                        — loadCatalog() → Catalog; PlanSlug type
    │   │   ├── projection.ts                     — subscriptionToEntitlement(sub, catalog) → EntitlementPatch; EntitlementPatch type
    │   │   ├── require-plan.ts                   — requirePlan('pro'|'team') throws BillingError; PLAN_RANK
    │   │   ├── upgrade.ts                        — upgrade Server Action (authedAction 'admin'); creates Customer + Checkout Session
    │   │   ├── portal.ts                         — openPortal Server Action (authedAction 'admin'); returns Billing Portal URL
    │   │   ├── transfer-ownership.ts             — transferBillingOwnership (SEEDED DEFECT #3: no audit row)
    │   │   ├── stripe.ts                         — stripe SDK singleton; Stripe type re-export
    │   │   └── index.ts                          — barrel: re-exports openPortal, requirePlan, upgrade only
    │   ├── webhooks/
    │   │   ├── processed-events.ts               — claimEvent(tx, provider, eventId, eventType) idempotency claim
    │   │   └── stripe.ts                         — dispatch, resolveOrgIdFromCustomer, onCheckoutCompleted, onSubscriptionUpdated, onSubscriptionDeleted
    │   ├── admin/
    │   │   └── transfer-ownership.ts             — transferOwnershipAction + transferOwnership (SEEDED DEFECT #1: fail-open try/catch on requireRole)
    │   └── account/
    │       └── delete-account.ts                 — deleteAccount(userId) (SEEDED DEFECT #8: deletes only users row)
    ├── emails/
    │   ├── email-tailwind-config.ts              — Tailwind config for email templates
    │   ├── components/email-layout.tsx           — shared email wrapper component
    │   ├── welcome-verification.tsx              — WelcomeVerification email component
    │   ├── invite.tsx                            — InviteEmail component
    │   └── ExportReadyEmail.tsx                  — export-ready notification email
    ├── components/ui/                            — shadcn/ui primitives (button, card, input, label, badge, progress, select, separator, skeleton, sonner)
    └── app/
        ├── layout.tsx                            — root layout; providers
        ├── page.tsx                              — root redirect page
        ├── globals.css                           — Tailwind globals
        ├── _components/
        │   ├── field-error.tsx                   — FieldError component for form validation
        │   └── submit-button.tsx                 — SubmitButton with pending state
        ├── api/
        │   ├── auth/[...all]/route.ts            — Better Auth catch-all route handler
        │   ├── auth/reset-password/route.ts      — POST reset-password (SEEDED DEFECT #6: no rate limit)
        │   ├── exports/[runId]/route.ts          — GET run state via retrieveRun
        │   ├── exports/trigger/route.ts          — POST export trigger (SEEDED DEFECT #10: bare .limit() bypasses safeLimit)
        │   └── webhooks/stripe/route.ts          — POST Stripe webhook; verify→claim→dispatch in one tx
        ├── (auth)/
        │   ├── sign-in/{page,loading,sign-in-form,actions}.tsx — sign-in flow
        │   ├── sign-up/{page,sign-up-form,actions}.tsx         — sign-up flow
        │   ├── verify-email/{page,loading,verify-email-resend}.tsx — email verification flow
        │   └── accept-invite/{page,loading,accept-form}.tsx    — invitation accept flow
        ├── (protected)/
        │   ├── layout.tsx                        — AppNav (email + sign-out); wraps children
        │   ├── sign-out-action.ts                — signOutAction Server Action
        │   ├── dashboard/{page,loading}.tsx       — dashboard page; getCurrentUser
        │   ├── settings/{page,loading,resend-test}.tsx — settings page + ResendClientTest (SEEDED DEFECT #5)
        │   └── invoices/
        │       ├── page.tsx                      — invoice list; requireOrgUser + listInvoices
        │       ├── loading.tsx                   — Suspense loading skeleton
        │       └── [id]/
        │           ├── page.tsx                  — invoice detail; getInvoiceWithNotes
        │           ├── loading.tsx               — Suspense loading skeleton
        │           └── notes.tsx                 — InvoiceNotes component (SEEDED DEFECT #2: dangerouslySetInnerHTML)
        └── onboarding/create-org/page.tsx        — org creation page
```

## Contracts

### src/env.ts
```ts
export const env: {
  // server
  DATABASE_URL: string,
  DATABASE_URL_UNPOOLED: string,
  SEED: number,
  BETTER_AUTH_SECRET: string,
  BETTER_AUTH_URL: string,
  RESEND_API_KEY: string,
  EMAIL_FROM: string,
  EMAIL_REPLY_TO: string,
  INVITATION_SIGNING_SECRET: string,
  UPSTASH_REDIS_REST_URL: string,
  UPSTASH_REDIS_REST_TOKEN: string,
  STRIPE_SECRET_KEY: string,       // must start with sk_test_
  STRIPE_WEBHOOK_SECRET: string,   // must start with whsec_
  STRIPE_PORTAL_RETURN_URL: string,
  TRIGGER_SECRET_KEY: string,      // must start with tr_
  TRIGGER_PROJECT_REF: string,     // must start with proj_
  APP_URL: string,
  // client (NEXT_PUBLIC_*)
  NEXT_PUBLIC_APP_NAME: string,
  NEXT_PUBLIC_APP_URL: string,
  NEXT_PUBLIC_POSTHOG_KEY: string,
  NEXT_PUBLIC_POSTHOG_HOST: string,
  NEXT_PUBLIC_RESEND_API_KEY: string,  // SEEDED DEFECT #5
}
```

### src/db/index.ts
```ts
export const db: DrizzleDB
export const dbUnpooled: DrizzleDB
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
```

### src/db/columns.ts
```ts
export const timestamps: { createdAt: PgTimestampColumn }  // precision:3, withTimezone
```

### src/db/schema.ts — table shapes
- `emailSuppressions`: id(uuid), email(text unique), reason(suppressionReason enum), providerEventId, bypassUntil, metadata(jsonb), createdAt, updatedAt
  - `suppressionReason` enum: `'hard_bounce' | 'soft_bounce_threshold' | 'complaint' | 'manual_unsubscribe'`
  - types: `EmailSuppression`, `NewEmailSuppression`
- `invoices`: id(uuid uuidv7), organizationId(text→org), number, customerName, status(`'draft'|'sent'|'paid'|'overdue'`), total(numeric), currency, createdAt, dueAt; index org+createdAt desc
  - types: `Invoice`, `NewInvoice`
- `exports`: id(uuid uuidv7), organizationId, requestedBy(text→user), status(`'queued'|'running'|'completed'|'failed'`), runId, rowCount, idempotencyKey, dayBucket, pagesDone, pagesTotal, downloadUrl, requestedAt, completedAt; unique(orgId, requestedBy, dayBucket)
  - types: `ExportRow`, `NewExportRow`
- `invoiceNotes`: id(uuid uuidv7), invoiceId(uuid→invoices), organizationId, authorId(text→user set null), body(text), createdAt; index invoiceId
  - types: `InvoiceNote`, `NewInvoiceNote`
- `rateLimitLog`: id(uuid), event(rateLimitEvent enum), limiter(text), key(text), remaining(int), reset(bigint), firedAt
  - `rateLimitEvent` enum: `'rate_limit_rejected' | 'rate_limit_unavailable'`
  - types: `RateLimitLog`, `NewRateLimitLog`
- `processedEvents`: id(bigint identity), provider, eventId, eventType, receivedAt; unique(provider, eventId)
  - types: `ProcessedEvent`, `NewProcessedEvent`
- `planEntitlements`: organizationId(text PK→org), plan(`'free'|'pro'|'team'`), status(`'trialing'|'active'|'past_due'|'canceled'|'incomplete'`), subscriptionId, currentPeriodEnd, cancelAtPeriodEnd(bool), seats(int), lastEventAt, updatedAt
  - types: `PlanEntitlement`, `NewPlanEntitlement`

### src/db/audit.ts — auditLogs table
- Columns: id(uuid uuidv7 PK), organizationId(text→org cascade), actorUserId(text→user set null), actorIp, actorUserAgent, action, subjectType, subjectId, payload(jsonb), createdAt
- RLS: enableRLS(); permissive isolation policy `organizationId = current_setting('app.org_id', true)`; restrictive no-update + no-delete policies
- Exports: `AuditLog`, `NewAuditLog`, `AuditEvent { action, subjectType?, subjectId?, payload? }`

### src/db/audit-log.ts
```ts
export type ExplicitAuditEvent = AuditEvent & { organizationId: string; actorUserId: string | null }
export const logAudit: (tx: Transaction, event: AuditEvent | ExplicitAuditEvent) => Promise<void>
// Session path: derives org+actor from requireOrgUser+headers
// Explicit path: uses supplied organizationId+actorUserId (for webhook/task calls with no session)
```

### src/db/tenant.ts
```ts
export const withTenant: <T>(orgId: string, fn: (tx: Transaction) => Promise<T>) => Promise<T>
// Runs fn inside db.transaction with SET LOCAL app.org_id = orgId

export const tenantDb: (orgId: string) => {
  query: {
    member: { findMany, findFirst }      // org-scoped
    invitation: { findMany, findFirst }  // org-scoped
    invoices: { findMany, findFirst }    // org-scoped
    exports: { findMany, findFirst }     // org-scoped
  }
  insert: <T extends TenantTable>(table: T) => { values(value: Omit<T['$inferInsert'], 'organizationId'>): ... }
  update: <T extends TenantTable>(table: T) => { set(value): { where(where?): ... } }
  delete: <T extends TenantTable>(table: T) => { where(where?): ... }
  transaction: <T>(fn: (tx: Transaction) => Promise<T>) => Promise<T>
}
// TENANT_TABLES = { member, invitation, invoices, exports }
```

### src/db/queries/audit.ts
```ts
export const auditLogCount: (orgId: string) => Promise<number>
export const recentAuditLogs: (orgId: string) => Promise<{id, action, createdAt}[]>  // limit 20
```

### src/db/queries/invoices.ts
```ts
export type InvoiceView = 'active'
export type ListInvoicesArgs = { orgId: string; view: InvoiceView; cursor: string | null; pageSize?: number }
export type ListInvoicesResult = { rows: Invoice[]; nextCursor: string | null }
export const listInvoices: (args: ListInvoicesArgs) => Promise<ListInvoicesResult>  // cursor = createdAt ISO string
export const countInvoices: ({ orgId }: { orgId: string }) => Promise<number>
```

### src/db/queries/invoice-notes.ts
```ts
export const getInvoiceWithNotes: (orgId: string, invoiceId: string) => Promise<{ invoice: Invoice; notes: InvoiceNote[] } | null>
```

### src/db/queries/entitlements.ts
```ts
export type EntitlementRow = PlanEntitlement
export const getEntitlement: (orgId: string) => Promise<PlanEntitlement>  // React.cache; throws if missing
export const hasActiveAccess: (e: PlanEntitlement) => boolean  // trialing|active|past_due → true; canceled|incomplete → false
```

### src/db/queries/members.ts
```ts
export const listMembers: (orgId: string) => Promise<MemberWithUser[]>
```

### src/db/queries/organizations.ts
```ts
export const getOrgWithOwnerEmail: (orgId: string) => Promise<{ id: string; stripeCustomerId: string | null; ownerEmail: string }>
export const setStripeCustomerId: (orgId: string, customerId: string) => Promise<void>
```

### src/lib/auth.ts
```ts
export const SESSION_COOKIE_PREFIX: string  // '__Host-better-auth' (prod) | 'better-auth' (dev)
export const INVITATION_TTL_SECONDS: number  // 604800 (7 days)
export const auth: BetterAuth  // instance with organization plugin + nextCookies
export const getCurrentUser: () => Promise<User | null>
export const requireUser: (next?: string) => Promise<User>  // redirects to /sign-in if no session
export const requireOrgUser: () => Promise<{ user: User; orgId: string; role: Role }>  // cached per request
```

### src/lib/auth/roles.ts
```ts
export type Role = 'owner' | 'admin' | 'member'
export const ROLE_RANK: Record<Role, number>  // { member: 0, admin: 1, owner: 2 }
export const roleAtLeast: (role: Role, required: Role) => boolean
```

### src/lib/auth/authed-action.ts
```ts
export type AuthedCtx = { user, orgId, role, db: ReturnType<typeof tenantDb>, ip, userAgent }
export const authedAction: <TSchema, TOut>(role: Role, schema: TSchema, fn: (input, ctx: AuthedCtx) => Promise<Result<TOut>>) => (_prev, formData) => Promise<Result<TOut>>
// Flow: requireOrgUser → roleAtLeast check → schema.safeParse → fn(input, ctx)
// Catch-all: thrown access check → err('unauthorized', …)
```

### src/lib/auth/require-role.ts
```ts
export const requireRole: (required: Role) => Promise<{ user, orgId, role }>
// Throws on below-required actor; callers run for the throw (never catch)
```

### src/lib/auth/error-mapping.ts
```ts
export const mapAuthError: (error: unknown) => Result<never>
// INVALID_EMAIL_OR_PASSWORD → unauthorized; EMAIL_NOT_VERIFIED → forbidden; 429 → rate_limited; else → internal
```

### src/lib/result.ts
```ts
export type ErrorCode = 'validation' | 'conflict' | 'not_found' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'internal'
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; userMessage: string; fieldErrors?: Record<string, string[]> } }
export const ok: <T>(data: T) => Result<T>
export const err: (code: ErrorCode, userMessage: string, fieldErrors?: Record<string, string[]>) => Result<never>
export const isUniqueViolation: (e: unknown) => boolean  // checks SQLSTATE 23505 on error.cause
```

### src/lib/rate-limit.ts
```ts
export const signInLimiter: Ratelimit   // slidingWindow(10, '1 m'); prefix 'rl:signin'
export const signUpLimiter: Ratelimit   // slidingWindow(5, '10 m'); prefix 'rl:signup'
export const resetLimiter: Ratelimit    // slidingWindow(3, '15 m'); prefix 'rl:reset'
export const LIMITER_MAX: { signin: 10; signup: 5; reset: 3 }
```

### src/lib/safe-limit.ts
```ts
export type RateLimitResult = Awaited<ReturnType<Ratelimit['limit']>>
export const safeLimit: (limiter: Ratelimit, prefix: string, key: string) => Promise<RateLimitResult>
// On Redis outage: logs rate_limit_unavailable, returns success:true (fail-open)
```

### src/lib/rate-limit-headers.ts
```ts
export type RateLimitBudget = { limit: number; remaining: number; reset: number }
export const rateLimitBudget: (r: RateLimitResult) => RateLimitBudget
export const rateLimitHeaders: (r: RateLimitResult) => Record<string, string>
export const rateLimited: (r: RateLimitResult, gate: 'ip' | 'email', key: string) => Promise<Result<never>>
export const rateLimitedResponse: (r: RateLimitResult) => Response  // 429 with Retry-After
```

### src/lib/billing/billing-error.ts
```ts
export class BillingError extends Error {
  readonly code: 'no_access' | 'plan_required' | 'no_customer' | 'unknown_customer' | 'unknown_plan'
  constructor(code, userMessage: string)
}
```

### src/lib/billing/catalog.ts
```ts
export type PlanSlug = 'free' | 'pro' | 'team'
export type Catalog = {
  planFromLookupKey: (key: string | null | undefined) => PlanSlug | null
  lookupKeys: Record<string, PlanSlug>
}
export const loadCatalog: () => Catalog
```

### src/lib/billing/projection.ts
```ts
export type EntitlementPatch = Pick<PlanEntitlement, 'plan' | 'status' | 'subscriptionId' | 'currentPeriodEnd' | 'cancelAtPeriodEnd' | 'seats'>
export const subscriptionToEntitlement: (sub: Stripe.Subscription, catalog: Catalog) => EntitlementPatch
// Throws BillingError('unknown_plan') for missing/unrecognized lookup_key
```

### src/lib/billing/index.ts
```ts
export { openPortal } from './portal'    // authedAction 'admin'; returns { url: string }
export { requirePlan } from './require-plan'  // throws BillingError; 'pro'|'team' arg
export { upgrade } from './upgrade'      // authedAction 'admin'; returns { url: string }
```

### src/lib/webhooks/stripe.ts
```ts
export const dispatch: (tx: Transaction, event: Stripe.Event) => Promise<void>
export const resolveOrgIdFromCustomer: (tx: Transaction, stripeCustomerId: string) => Promise<string>
export const onCheckoutCompleted: (tx, event) => Promise<void>   // UPSERT planEntitlements + audit
export const onSubscriptionUpdated: (tx, event) => Promise<void> // UPDATE with ordering predicate + audit
export const onSubscriptionDeleted: (tx, event) => Promise<void> // wind to free + audit
```

### src/lib/webhooks/processed-events.ts
```ts
export const claimEvent: (tx: Transaction, provider: string, eventId: string, eventType: string) => Promise<boolean>
// true = newly claimed; false = duplicate (onConflictDoNothing)
```

### src/lib/invitations/url.ts
```ts
export const generateInviteToken: () => string  // 32-byte base64url
export const signedInviteUrl: (invitationId: string, rawToken: string) => Promise<string>
export const verifyInviteSignature: (invitationId, rawToken, sig) => Promise<boolean>
export const sha256: (raw: string) => Promise<string>  // hex digest
```

### src/lib/exports/to-csv.ts
```ts
export const rowsToCsv: (rows: Invoice[]) => string  // CRLF RFC-4180; columns: id,number,customerName,status,total,currency,createdAt,dueAt
```

### src/lib/exports/errors.ts
```ts
export class ExportError extends Error {
  readonly code: 'EMPTY_RESULTSET' | 'UNKNOWN_PLAN'
}
```

### src/lib/problem.ts
```ts
export const problemJson: (status: number, title: string) => Response  // application/problem+json; no body echo
```

### src/lib/logger.ts
```ts
export const logger: pino.Logger  // level: LOG_LEVEL ?? 'info'; base: undefined
```

### src/lib/trigger-client.ts
```ts
export type RunState = { status, metadata, output, attemptCount, completedAt, error }
export const retrieveRun: (runId: string) => Promise<RunState>
export const listRunsForOrg: (orgId: string) => Promise<{ id, status, tags }[]>  // filtered by org:${orgId} tag
```

### trigger/export-invoices.ts
```ts
export const exportQueue: Queue  // name: 'export'; concurrencyLimit: 1
export const exportInvoices: SchemaTask<{ organizationId: string; requestedBy: string }>
// id: 'export-invoices'; sequential page loop via paginatePage.triggerAndWait;
// closes with sendExportEmail.triggerAndWait + tenantDb transaction (update exports + logAudit)
// Returns: { ok: true; runId: string; rowCount: number }
```

### trigger/paginate-page.ts
```ts
export const paginatePage: SchemaTask<{ organizationId: string; page: number; cursor: string | null }>
// id: 'paginate-page'; returns { csv: string; nextCursor: string | null; rowCount: number }
```

### trigger/send-export-email.ts
```ts
export const sendExportEmail: SchemaTask<{ organizationId, recipientUserId, rowCount, downloadUrl }>
// id: 'send-export-email'; returns Result<{ id: string }>; suppression is expected (not a failure)
```

### trigger/delete-user.ts
```ts
export const deleteUser: SchemaTask<{ userId: string }>
// id: 'delete-user'; walks full data graph + anonymizes auditLogs + deletes user row
// (healthy reference impl for finding 8; seeded deleteAccount does NOT use this)
```

### Server Actions (exported async functions)
| File | Export | Role | Schema |
|---|---|---|---|
| `(auth)/sign-in/actions.ts` | `signInAction` | public | `{email, password, next?}` |
| `(auth)/sign-up/actions.ts` | `signUpAction` | public | `{name, email, password}` |
| `(protected)/sign-out-action.ts` | `signOutAction` | session | none |
| `lib/invitations/send.ts` | `sendInvitation` | admin | `{email, role: 'admin'|'member'}` |
| `lib/invitations/accept.ts` | `acceptInvitation` | capability | `{id, token}` |
| `lib/invitations/manage.ts` | `changeMemberRole` | admin | `{memberId, newRole: 'admin'|'member'}` |
| `lib/exports/start.ts` | `startExport` | member | `{}` |
| `lib/billing/upgrade.ts` | `upgrade` | admin | `{planSlug: 'pro'|'team'}` |
| `lib/billing/portal.ts` | `openPortal` | admin | `{returnPath?}` |
| `lib/admin/transfer-ownership.ts` | `transferOwnershipAction` | admin | `{nextOwnerId}` (DEFECT #1) |

### API Routes
| File | Method | Purpose |
|---|---|---|
| `api/auth/[...all]/route.ts` | all | Better Auth catch-all |
| `api/auth/reset-password/route.ts` | POST | Password reset email (DEFECT #6: no rate limit) |
| `api/exports/[runId]/route.ts` | GET | Run state poll via retrieveRun |
| `api/exports/trigger/route.ts` | POST | Export trigger ingress (DEFECT #10: bare .limit()) |
| `api/webhooks/stripe/route.ts` | POST | Stripe webhook; verify→claim→dispatch in one tx |

## Dependencies

```json
{
  "@t3-oss/env-nextjs": "^0.13.11",
  "@trigger.dev/sdk": "^4.4.0",
  "@upstash/ratelimit": "^2.0.8",
  "@upstash/redis": "^1.38.0",
  "better-auth": "^1.6.14",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "drizzle-orm": "^0.45.1",
  "lucide-react": "^1.17.0",
  "next": "16.2.7",
  "next-themes": "^0.4.6",
  "pino": "^9.14.0",
  "postgres": "^3.4.7",
  "posthog-js": "^1.386.6",
  "radix-ui": "^1.4.3",
  "react": "19.2.4",
  "react-dom": "19.2.4",
  "react-email": "^6.5.0",
  "resend": "^6.12.4",
  "server-only": "^0.0.1",
  "sonner": "^2.0.7",
  "stripe": "^22.2.0",
  "tailwind-merge": "^3.6.0",
  "tw-animate-css": "^1.4.0",
  "uuidv7": "^1.0.2",
  "zod": "^4.4.3"
}
```

Dev: `@biomejs/biome@2.4.16`, `drizzle-kit@^0.31.5`, `drizzle-zod@^0.8.0`, `drizzle-seed@^0.3.1`, `tailwindcss@^4.3.0`, `typescript@^6.0.3`, `vitest@^4.1.8`, `tsx@^4.20.0`, `babel-plugin-react-compiler@1.0.0`, `auth@^1.6.14`, `dotenv-cli@^10.0.0`, `trigger.dev@^4.4.0`

## Start diff

The start and solution code directories are **identical**. Every source file in `src/`, `trigger/`, `scripts/`, and `tests/` is the same in both. The seeded defects are present in both (they are intentional — the audit target ships with bugs).

The sole difference is in the `findings/` directory:

**start/findings/** — skeleton templates awaiting student work:
- `001-fail-closed.md` through `008-gdpr-deletion.md`: contain only the 4-section template (`## Rule`, `## Location`, `## Consequence`, `## Fix`) with TODO comments naming the expected content per lesson
- `out-of-scope.md`: single TODO comment line
- `SUMMARY.md`: single TODO comment line

**solution/findings/** — completed audit findings:
- `001-fail-closed.md` through `008-gdpr-deletion.md`: fully written findings with rule citation, grep commands, consequence in user-visible terms, fix with senior reach
- `out-of-scope.md`: notes the duplicated transfer-ownership logic as an out-of-scope code-quality observation
- `SUMMARY.md`: full coverage scorecard (10/10, 8/8 floor + 2 bonus), clause-by-clause scoring rubric, senior-reach detail per finding, bonus findings 9 (PostHog consent gate) and 10 (safeLimit bypass), grep/curl checklist, forward pointers to chapters 088/090/092/095/097/104

**TODO comments in start/findings/ (these are the student's work prompt):**
- `findings/001-fail-closed.md`: `<!-- TODO(L2) — document the fail-closed bypass in lib/admin/transfer-ownership.ts: rule (fail-closed 080 L1), location + grep, consequence (user-visible unauthorized transfer), fix (let authedAction convert the throw) -->`
- `findings/002-xss-html-sink.md`: `<!-- TODO(L3) — document the dangerouslySetInnerHTML sink in invoices/[id]/notes.tsx: rule, location + grep + running-app fingerprint, consequence (stored XSS), fix (sanitize at write+read, historical data, cross-ref finding 4) -->`
- `findings/003-audit-log-ownership-transfer.md`: `<!-- TODO(L4) — document the missing audit-log write in lib/billing/transfer-ownership.ts: rule (081 L3), location, consequence (silently reassigns org owner), fix (in-tx logAudit with slug + payload) -->`
- `findings/004-csp-header.md`: `<!-- TODO(L5) — document the CSP header omission in next.config.ts + proxy.ts: rule (081 L1), location + curl evidence, consequence (no XSS backstop), fix (nonce + strict-dynamic) -->`
- `findings/005-secret-next-public.md`: `<!-- TODO(L6) — document the NEXT_PUBLIC_RESEND_API_KEY in env.ts + resend-test.tsx: rule (081 L6/L7), location + DevTools evidence, consequence (key in bundle), fix (server partition + rotation) -->`
- `findings/006-rate-limit-password-reset.md`: `<!-- TODO(L7) — document the missing rate limit on api/auth/reset-password: rule (081 L2), location, consequence (inbox-bomb + cost), fix (dual-key safeLimit) -->`
- `findings/007-dep-hygiene.md`: `<!-- TODO(L8) — document the dep-hygiene gap in pnpm-workspace.yaml: rule (081 L8), location, consequence (supply-chain window), fix (minimumReleaseAge + blockExoticSubdeps + strictDepBuilds) -->`
- `findings/008-gdpr-deletion.md`: `<!-- TODO(L9) — document the GDPR deletion gap in lib/account/delete-account.ts: rule (081 L4), location, consequence (PII survives deletion), fix (full graph walk + anonymize audit + external deletes via delete-user task) -->`
- `findings/out-of-scope.md`: `<!-- TODO(L2) — observations outside the eight categories -->`
- `findings/SUMMARY.md`: `<!-- TODO(L10) — coverage count, deliberate misses, the two bonus findings (consent gate, safeLimit bypass), per-finding senior-reach detail, personal grep/curl checklist -->`
