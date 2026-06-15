# Chapter 091 — Codebase Summary

## Solution file tree

```
projects/Chapter 091/solution/
├── package.json                                       # pnpm workspace; scripts for test:integration, test:e2e, db:*, seed:stripe
├── vitest.config.ts                                   # Two Vitest projects: lesson (no DB) + integration (real Postgres, rollback)
├── playwright.config.ts                               # E2E config: setup project writes .auth/admin.json; chromium reuses storageState
├── biome.json                                         # Biome formatter/linter config
├── drizzle.config.ts                                  # Drizzle Kit config
├── next.config.ts                                     # Next.js config
├── src/
│   ├── env.ts                                         # T3 env boundary: validates all server/client env vars at boot
│   ├── proxy.ts                                       # DB proxy (tenancy routing)
│   ├── db/
│   │   ├── index.ts                                   # Drizzle db + Transaction type export
│   │   ├── schema.ts                                  # App-owned tables: emailSuppressions, processedEvents, planEntitlements
│   │   ├── schema/auth.ts                             # Better Auth tables (user, session, account, verification, organization + stripeCustomerId, member, invitation) + relations
│   │   ├── columns.ts                                 # Shared timestamps column helper
│   │   ├── audit.ts                                   # auditLogs table
│   │   ├── audit-log.ts                               # logAudit() helper
│   │   ├── tenant.ts                                  # tenantDb(orgId) scoped Drizzle instance
│   │   ├── test-tx-context.ts                         # AsyncLocalStorage<Transaction> shared store for test rollback harness
│   │   └── queries/
│   │       ├── entitlements.ts                        # getEntitlement(orgId), hasActiveAccess(e), EntitlementRow type
│   │       ├── organizations.ts                       # getOrgWithOwnerEmail, setStripeCustomerId
│   │       ├── members.ts                             # member queries
│   │       ├── invitations.ts                         # invitation queries
│   │       └── audit.ts                               # audit queries
│   ├── lib/
│   │   ├── result.ts                                  # Result<T>, ok(), err(), ErrorCode, isUniqueViolation()
│   │   ├── logger.ts                                  # pino logger
│   │   ├── problem.ts                                 # problemJson() helper (RFC 7807 application/problem+json)
│   │   ├── auth.ts                                    # requireOrgUser() — redirects if unauthenticated
│   │   ├── auth-client.ts                             # Better Auth client-side instance
│   │   ├── auth-schema.config.ts                      # Better Auth server config
│   │   ├── email.ts                                   # Resend send wrapper (checks suppressions)
│   │   ├── suppressions.ts                            # Suppression list helpers
│   │   ├── redirects.ts                               # Redirect constants
│   │   ├── utils.ts                                   # cn() classname helper
│   │   ├── auth/
│   │   │   ├── authed-action.ts                       # authedAction(role, schema, fn) — Server Action factory; resolve→authorize→parse→call
│   │   │   ├── roles.ts                               # Role type, roleAtLeast()
│   │   │   └── error-mapping.ts                       # Better Auth error → user message map
│   │   ├── billing/
│   │   │   ├── index.ts                               # Barrel: re-exports upgrade, openPortal, requirePlan
│   │   │   ├── stripe.ts                              # Single Stripe SDK instance (server-only); exports stripe + Stripe namespace type
│   │   │   ├── catalog.ts                             # loadCatalog() — parses catalog.json; PlanSlug type, Catalog type
│   │   │   ├── catalog.json                           # lookup_key → plan slug map (course_pro_monthly, course_team_monthly)
│   │   │   ├── billing-error.ts                       # BillingError class; codes: no_access, plan_required, no_customer, unknown_customer, unknown_plan
│   │   │   ├── projection.ts                          # subscriptionToEntitlement(sub, catalog): EntitlementPatch; toEntitlementStatus() pure map
│   │   │   ├── upgrade.ts                             # 'use server' — upgrade action: creates/reuses Stripe Customer, resolves Price by lookup_key, opens Checkout Session
│   │   │   ├── portal.ts                              # 'use server' — openPortal action: opens Billing Portal session URL
│   │   │   └── require-plan.ts                        # requirePlan(planSlug) — server-only gate; throws BillingError; PLAN_RANK order enforcement
│   │   ├── webhooks/
│   │   │   ├── stripe.ts                              # dispatch(), onCheckoutCompleted(), onSubscriptionUpdated(), onSubscriptionDeleted(), resolveOrgIdFromCustomer()
│   │   │   └── processed-events.ts                    # claimEvent(tx, provider, eventId, eventType): Promise<boolean>
│   │   └── invitations/
│   │       ├── manage.ts                              # invitation management
│   │       ├── accept.ts                              # accept invitation
│   │       ├── url.ts                                 # signed URL helpers
│   │       └── send.ts                                # send invitation email
│   ├── app/
│   │   ├── layout.tsx                                 # Root layout; providers
│   │   ├── page.tsx                                   # Root page (redirect to /dashboard or /sign-in)
│   │   ├── globals.css                                # Tailwind base styles
│   │   ├── api/
│   │   │   ├── auth/[...all]/route.ts                 # Better Auth catch-all handler
│   │   │   └── webhooks/stripe/route.ts               # POST: verify signature → claimEvent → dispatch in one db.transaction
│   │   ├── (auth)/
│   │   │   ├── sign-in/                               # Sign-in page, form, actions, loading
│   │   │   ├── sign-up/                               # Sign-up page, form, actions
│   │   │   ├── verify-email/                          # Email verification page, resend
│   │   │   └── accept-invite/                         # Invite acceptance page, form
│   │   ├── (protected)/
│   │   │   ├── layout.tsx                             # Protected layout (auth guard)
│   │   │   ├── sign-out-action.ts                     # Sign-out Server Action
│   │   │   ├── dashboard/                             # Dashboard page, org-switcher, loading
│   │   │   ├── billing/success/                       # Billing success page + Poller (polls until plan flips to pro)
│   │   │   └── inspector/
│   │   │       ├── page.tsx                           # Inspector Server Component: entitlement + audit + processed-events panels
│   │   │       ├── _data.ts                           # Data-fetching for inspector (getEntitlement, audit tail, etc.)
│   │   │       ├── actions.ts                         # Inspector Server Actions
│   │   │       ├── constants.ts                       # Inspector constants
│   │   │       ├── loading.tsx                        # Inspector loading skeleton
│   │   │       ├── pro-only/
│   │   │       │   ├── page.tsx                       # requirePlan('pro') gate; renders pro-gated content
│   │   │       │   ├── error.tsx                      # BillingError error boundary: renders upgrade or no-access message
│   │   │       │   └── loading.tsx
│   │   │       └── _components/
│   │   │           ├── entitlement-panel.tsx          # Displays plan/status/cancelAtPeriodEnd; testid=entitlement-plan
│   │   │           ├── checkout-button.tsx            # Client island; calls upgrade action; navigates to Stripe Checkout URL
│   │   │           ├── portal-button.tsx              # Client island; calls openPortal action; opens Portal in new tab
│   │   │           ├── processed-events-tail.tsx      # Tail of processed_events table
│   │   │           ├── audit-tail.tsx                 # Tail of audit_logs
│   │   │           ├── acting-user-switcher.tsx       # Debug: switch acting org/user
│   │   │           └── debug-controls.tsx             # Debug controls panel
│   │   ├── _components/
│   │   │   ├── submit-button.tsx                      # Form submit button with pending state
│   │   │   ├── field-error.tsx                        # Field-level error display
│   │   │   └── providers.tsx                          # Client providers (Toaster, etc.)
│   │   └── onboarding/create-org/page.tsx             # Org creation onboarding page
│   ├── components/ui/                                 # shadcn/ui primitives (button, card, input, label, badge, etc.)
│   ├── emails/
│   │   ├── email-tailwind-config.ts                   # Tailwind config for React Email
│   │   ├── components/email-layout.tsx                # Shared email layout wrapper
│   │   ├── invite.tsx                                 # Invitation email template
│   │   └── welcome-verification.tsx                   # Welcome/verify-email template
│   └── test/                                          # Test harness (not imported by production code)
│       ├── empty-module.ts                            # Blank stub aliased to server-only/client-only in integration project
│       ├── load-test-env.ts                           # Side-effect: dotenv .env.test + TZ=UTC; first import in integration-setup
│       ├── integration-setup.ts                       # vi.mock('@/db') proxy + vi.mock stripe.subscriptions.retrieve + MSW lifecycle
│       ├── stripe-retrieve-registry.ts                # Per-test Map<id, Stripe.Subscription>; registerSubscription, lookupSubscription, resetSubscriptions
│       ├── db/
│       │   ├── worker-db.ts                           # Lazy test Drizzle client (DATABASE_URL_TEST); getTestDb()
│       │   └── with-rollback.ts                       # withRollback(body) — wraps test in a transaction thrown at the end via RollbackSignal
│       ├── fixtures/
│       │   ├── auth.ts                                # signedInAs(opts, tx): seeds user+org+member+planEntitlements in tx; anonymous()
│       │   ├── stripe-events.ts                       # checkoutCompleted(), subscriptionUpdated(), subscriptionDeleted() event factories
│       │   └── stripe-subscription.ts                 # fixtureSubscription(opts): minimal Stripe.Subscription with item-level fields
│       ├── helpers/
│       │   └── post-webhook.ts                        # postWebhook(event, opts): signs event + calls real POST route handler
│       └── msw/
│           ├── server.ts                              # MSW setupServer (Resend only; Stripe not on MSW)
│           └── handlers/resend.ts                     # MSW handler for POST /emails; records into resendCalls[]
├── tests/
│   ├── integration/
│   │   ├── webhook-checkout-completed.int.test.ts     # Happy-path: signed checkout → 200, processed_events row, plan_entitlements{plan:pro}, audit row
│   │   ├── webhook-idempotency.int.test.ts            # Replay: same eventId twice → 200 duplicate:true, 1 ledger row, no state change
│   │   └── webhook-signature-rejected.int.test.ts     # Tampered signature → 400 problem+json, nothing written
│   └── e2e/
│       ├── fixtures.ts                                # Playwright fixtures: adminPage (storageState), orgSlug constant
│       ├── auth.setup.ts                              # Setup project: POST /api/auth/sign-in/email → saves .auth/admin.json
│       ├── checkout-money-path.spec.ts                # E2E: /inspector free → Upgrade → Stripe Checkout → /billing/success → pro
│       └── helpers/
│           └── fill-stripe-card.ts                    # fillStripeCard(page, card): fills Stripe iframe card fields
```

---

## Contracts

### `src/env.ts`
- `env`: validated env object  
  Server: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `SEED`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `INVITATION_SIGNING_SECRET`, `STRIPE_SECRET_KEY` (must start `sk_test_`), `STRIPE_WEBHOOK_SECRET` (must start `whsec_`), `STRIPE_PORTAL_RETURN_URL`, `APP_URL`  
  Client: `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`

### `src/db/schema.ts`
- **`suppressionReason`** pgEnum — `'hard_bounce' | 'soft_bounce_threshold' | 'complaint' | 'manual_unsubscribe'`
- **`emailSuppressions`** table — `id uuid PK, email text UNIQUE, reason suppressionReason, providerEventId text?, bypassUntil timestamptz?, metadata jsonb, ...timestamps, updatedAt`
- `EmailSuppression`, `NewEmailSuppression` — inferred select/insert types
- **`processedEvents`** table — `id bigint PK (identity), provider text, eventId text, eventType text, receivedAt timestamptz DEFAULT now`; UNIQUE(`provider`, `eventId`)
- `ProcessedEvent`, `NewProcessedEvent`
- **`planEntitlements`** table — `organizationId text PK FK→organization.id CASCADE, plan text enum('free','pro','team') DEFAULT 'free', status text enum('trialing','active','past_due','canceled','incomplete') DEFAULT 'active', subscriptionId text?, currentPeriodEnd timestamptz?, cancelAtPeriodEnd bool DEFAULT false, seats int DEFAULT 1, lastEventAt timestamptz?, updatedAt timestamptz`
- `PlanEntitlement`, `NewPlanEntitlement`

### `src/db/schema/auth.ts`
- **`user`** — `id, name, email UNIQUE, emailVerified, image, createdAt, updatedAt`
- **`session`** — `id, expiresAt, token UNIQUE, createdAt, updatedAt, ipAddress, userAgent, userId FK→user, activeOrganizationId`
- **`account`** — standard OAuth account columns; FK→user
- **`verification`** — `id, identifier, value, expiresAt, createdAt, updatedAt`
- **`organization`** — `id, name, slug UNIQUE, logo, createdAt, metadata, stripeCustomerId text?` (app-added column)
- **`member`** — `id, organizationId FK, userId FK, role DEFAULT 'member', createdAt`
- **`invitation`** — `id, organizationId FK, email, role, status DEFAULT 'pending', expiresAt, createdAt, inviterId FK, tokenHash, acceptedAt?`
- Relations: `userRelations, sessionRelations, accountRelations, organizationRelations, memberRelations, invitationRelations`

### `src/db/queries/entitlements.ts`
- `EntitlementRow = PlanEntitlement`
- `getEntitlement(orgId: string): Promise<PlanEntitlement>` — React.cache; throws if row missing
- `hasActiveAccess(e: PlanEntitlement): boolean` — trialing/active/past_due → true; canceled/incomplete → false; exhaustive switch

### `src/db/test-tx-context.ts`
- `testTxContext: AsyncLocalStorage<Transaction>` — stored on globalThis; shared across the test graph

### `src/lib/result.ts`
- `ErrorCode = 'validation' | 'conflict' | 'not_found' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'internal'`
- `Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; userMessage: string; fieldErrors?: Record<string, string[]> } }`
- `ok<T>(data: T): Result<T>`
- `err(code, userMessage, fieldErrors?): Result<never>`
- `isUniqueViolation(e: unknown): boolean`

### `src/lib/auth/authed-action.ts`
- `AuthedCtx = { user, orgId: string, role: Role, db: ReturnType<typeof tenantDb>, ip: string|null, userAgent: string|null }`
- `authedAction<TSchema, TOut>(role: Role, schema: TSchema, fn): (_prev, formData) => Promise<Result<TOut>>`

### `src/lib/billing/billing-error.ts`
- `class BillingError extends Error` — `name = 'BillingError'`, `code: 'no_access'|'plan_required'|'no_customer'|'unknown_customer'|'unknown_plan'`, `userMessage: string`

### `src/lib/billing/catalog.ts`
- `PlanSlug = 'free' | 'pro' | 'team'`
- `Catalog = { planFromLookupKey(key: string|null|undefined): PlanSlug|null; lookupKeys: Record<string, PlanSlug> }`
- `loadCatalog(): Catalog` — parses `catalog.json`; throws on malformed JSON

### `src/lib/billing/catalog.json`
```json
{ "lookup_keys": { "course_pro_monthly": "pro", "course_team_monthly": "team" } }
```

### `src/lib/billing/stripe.ts`
- `stripe: Stripe` — single SDK instance; `apiVersion: '2026-05-27.dahlia'`
- `export type { Stripe }` — namespace re-export for callers

### `src/lib/billing/projection.ts`
- `EntitlementPatch = Pick<PlanEntitlement, 'plan'|'status'|'subscriptionId'|'currentPeriodEnd'|'cancelAtPeriodEnd'|'seats'>`
- `subscriptionToEntitlement(sub: Stripe.Subscription, catalog: Catalog): EntitlementPatch` — pure; reads item-level fields; throws `BillingError('unknown_plan')` on unknown lookup_key
- `export type { PlanSlug }`

### `src/lib/billing/upgrade.ts` (`'use server'`)
- `upgrade = authedAction('admin', { planSlug: z.enum(['pro','team']) }, fn): Promise<Result<{ url: string }>>` — creates/reuses Stripe Customer; resolves Price by lookup_key; creates Checkout Session with 14-day trial

### `src/lib/billing/portal.ts` (`'use server'`)
- `openPortal = authedAction('admin', { returnPath?: string }, fn): Promise<Result<{ url: string }>>` — opens Billing Portal session for org's Stripe Customer

### `src/lib/billing/require-plan.ts`
- `PLAN_RANK: { free: 0, pro: 1, team: 2 }` — constant
- `requirePlan(planSlug: 'pro' | 'team'): Promise<void>` — server-only gate; throws `BillingError('no_access')` or `BillingError('plan_required')`

### `src/lib/billing/index.ts`
- Re-exports: `{ openPortal }`, `{ requirePlan }`, `{ upgrade }`

### `src/lib/webhooks/processed-events.ts`
- `claimEvent(tx: Transaction, provider: string, eventId: string, eventType: string): Promise<boolean>` — inserts with `onConflictDoNothing`; returns true if freshly claimed

### `src/lib/webhooks/stripe.ts`
- `dispatch(tx: Transaction, event: Stripe.Event): Promise<void>` — routes to three handlers; logs unhandled events at info
- `resolveOrgIdFromCustomer(tx, stripeCustomerId): Promise<string>` — looks up org by Customer; throws `BillingError('unknown_customer')` if not found
- `onCheckoutCompleted(tx, event): Promise<void>` — retrieves Subscription; resolves org from Customer; cross-checks metadata; UPSERTs planEntitlements; writes audit log
- `onSubscriptionUpdated(tx, event): Promise<void>` — projects inline Subscription; UPDATE with ordering predicate (`lastEventAt < eventAt`); writes audit on non-zero result
- `onSubscriptionDeleted(tx, event): Promise<void>` — resets to `{ plan:'free', status:'canceled', subscriptionId:null }`; ordering predicate; audit on non-zero result

### `src/app/api/webhooks/stripe/route.ts`
- `POST(request: Request): Promise<Response>` — reads raw body; verifies signature; calls `claimEvent` + `dispatch` in one `db.transaction`; returns `{ received: true, duplicate: boolean }`; 400 problem+json on bad/missing signature

### `src/test/db/worker-db.ts`
- `getTestDb(): TestDb` — lazy memoized Drizzle client connecting to `DATABASE_URL_TEST`

### `src/test/db/with-rollback.ts`
- `withRollback(body: (ctx: { tx: Transaction }) => Promise<void>): () => Promise<void>` — wraps test body in a transaction rolled back via `RollbackSignal`

### `src/test/stripe-retrieve-registry.ts`
- `registerSubscription(sub: Stripe.Subscription): void`
- `lookupSubscription(id: string): Stripe.Subscription` — throws if not registered
- `resetSubscriptions(): void` — called in afterEach

### `src/test/helpers/post-webhook.ts`
- `postWebhook(event: Stripe.Event, opts?: { tamperSignature?: boolean; secret?: string }): Promise<Response>` — signs event with real `stripe.webhooks.generateTestHeaderString`; calls the real `POST` route handler

### `src/test/fixtures/stripe-events.ts`
- `checkoutCompleted(opts: { orgId, customerId, subscriptionId, eventId?, createdAt? }): Stripe.Event`
- `subscriptionUpdated(opts: { orgId?, subscriptionId, status, currentPeriodEnd, cancelAtPeriodEnd, lookupKey?, eventId?, createdAt? }): Stripe.Event`
- `subscriptionDeleted(opts: { subscriptionId, eventId?, createdAt? }): Stripe.Event`

### `src/test/fixtures/stripe-subscription.ts`
- `fixtureSubscription(opts: { id, lookupKey?, status?, currentPeriodEnd?, cancelAtPeriodEnd?, quantity?, orgId? }): Stripe.Subscription` — populates item-level fields only

### `src/test/fixtures/auth.ts`
- `Role = 'owner' | 'admin' | 'member'`; `Plan = 'free' | 'pro' | 'team'`
- `SignedInOptions = { role?, plan?, orgId? }`
- `signedInAs(opts, tx: Transaction): Promise<SignedIn>` — inserts user+org+member+session+planEntitlements in tx
- `anonymous(): { cookieJar: {} }`

### `src/test/msw/handlers/resend.ts`
- `ResendCall = { to, subject, html? }`
- `resendCalls: ResendCall[]` — mutable array reset in afterEach
- `resendHandlers: http.post(...)[]` — intercepts `https://api.resend.com/emails`

### `tests/e2e/fixtures.ts`
- `test = base.extend<{ adminPage: Page; orgSlug: string }>({...})`; `orgSlug = 'e2e-org'`
- `export { expect } from '@playwright/test'`

### `tests/e2e/helpers/fill-stripe-card.ts`
- `fillStripeCard(page: Page, card?: string): Promise<void>` — default card `'4242 4242 4242 4242'`; fills via `iframe[src*="js.stripe.com"]` frame locator

---

## Dependencies

| Package | Version |
|---|---|
| next | 16.2.7 |
| react | 19.2.4 |
| react-dom | 19.2.4 |
| better-auth | ^1.6.14 |
| drizzle-orm | ^0.45.1 |
| stripe | ^22.2.0 |
| zod | ^4.4.3 |
| @t3-oss/env-nextjs | ^0.13.11 |
| pino | ^9.14.0 |
| postgres | ^3.4.7 |
| react-email | ^6.5.0 |
| resend | ^6.12.4 |
| sonner | ^2.0.7 |
| uuidv7 | ^1.0.2 |
| radix-ui | ^1.4.3 |
| lucide-react | ^1.17.0 |
| clsx | ^2.1.1 |
| tailwind-merge | ^3.6.0 |
| class-variance-authority | ^0.7.1 |
| next-themes | ^0.4.6 |
| tw-animate-css | ^1.4.0 |
| server-only | ^0.0.1 |
| **devDependencies** | |
| @biomejs/biome | 2.4.16 |
| @playwright/test | ^1.60.0 |
| vitest | ^4.1.8 |
| msw | ^2.12.0 |
| drizzle-kit | ^0.31.5 |
| drizzle-zod | ^0.8.0 |
| drizzle-seed | ^0.3.1 |
| tailwindcss | ^4.3.0 |
| typescript | ^6.0.3 |
| tsx | ^4.20.0 |
| dotenv / dotenv-cli | ^17.0.0 / ^10.0.0 |
| vite-tsconfig-paths | ^5.1.4 |
| babel-plugin-react-compiler | 1.0.0 |
| @react-email/ui | ^6.5.0 |
| auth (CLI) | ^1.6.14 |

---

## Start diff

The `start/` directory has the same file tree as `solution/` with one exception: `src/test/integration-setup.ts` exists in `start/` but `src/lib/billing/projection.ts` (along with the full app) is present in both. The key difference is entirely in the **four test stub files**:

### Files that are TODO stubs in start, complete in solution

**`tests/integration/webhook-checkout-completed.int.test.ts`**
- Start: single-line `// TODO(L3)` comment + `describe.todo('happy-path checkout.session.completed webhook')`
- Solution: full test — `withRollback` → `signedInAs` → sets `stripeCustomerId` → `checkoutCompleted()` + `registerSubscription(fixtureSubscription(...))` → `postWebhook` → asserts 200 `{received:true, duplicate:false}`, 1 `processedEvents` row, `planEntitlements {plan:'pro', status:'trialing', subscriptionId, lastEventAt}`, 1 audit log, `resendCalls.length === 0`

**`tests/integration/webhook-idempotency.int.test.ts`**
- Start: single-line `// TODO(L4)` + `describe.todo('replayed checkout event is a no-op')`
- Solution: pins `eventId = 'evt_test_idempotency_fixed'`; calls `postWebhook` twice with same event; asserts first returns `{duplicate:false}`, second returns `{duplicate:true}`; `processedEvents` count stays 1; `updatedAt` unchanged; audit count stays 1

**`tests/integration/webhook-signature-rejected.int.test.ts`**
- Start: single-line `// TODO(L5)` + `describe.todo('tampered signature is rejected before any work')`
- Solution: calls `postWebhook(event, { tamperSignature: true })`; asserts 400, `content-type: application/problem+json`, `{title:'invalid_signature', status:400}`; `processedEvents` empty; `planEntitlements.plan === 'free'`; audit logs empty; `resendCalls` empty

**`tests/e2e/checkout-money-path.spec.ts`**
- Start: single-line `// TODO(L6)` + `test.fixme('admin can upgrade to Pro via Stripe Checkout', async () => {})`
- Solution: full Playwright test — loads `/inspector`, checks `entitlement-plan` testid has text `'free'`; clicks "Upgrade to Pro"; expects URL on `checkout.stripe.com`; calls `fillStripeCard`; clicks submit button (regex: start trial / subscribe / pay); expects redirect to `/billing/success`; asserts "finalizing" visible; asserts "you are all set / your plan is now pro" visible within 30s; navigates back to `/inspector`; asserts `entitlement-plan` now `'pro'`

### No other files differ

All application code (`src/`), test infrastructure (`src/test/`), config files, and all other `tests/e2e/` files are identical between start and solution.

### TODO comment summary

| File (start) | Lesson | Task |
|---|---|---|
| `tests/integration/webhook-checkout-completed.int.test.ts` | L3 | Happy-path integration test: signed event → DB assertions |
| `tests/integration/webhook-idempotency.int.test.ts` | L4 | Replay integration test: same eventId twice → duplicate:true |
| `tests/integration/webhook-signature-rejected.int.test.ts` | L5 | Tamper test: bad signature → 400 problem+json, nothing written |
| `tests/e2e/checkout-money-path.spec.ts` | L6 | E2E money path: /inspector → Stripe Checkout → /billing/success → pro |
