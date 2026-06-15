# Chapter 065 — Codebase Summary

## Solution file tree

```
solution/
├── package.json                                          — project manifest (name: chapter-065-stripe-webhook-entitlement)
├── tsconfig.json                                         — TypeScript config
├── next.config.ts                                        — Next.js config
├── drizzle.config.ts                                     — Drizzle Kit config (snake_case, three-schema array)
├── biome.json                                            — Biome linter/formatter config
├── components.json                                       — shadcn/ui config
├── vitest.config.ts                                      — Vitest config
├── drizzle/
│   ├── 0000_init_schema.sql                              — initial schema migration
│   ├── 0001_add_auth_tables.sql                          — Better Auth tables
│   ├── 0002_add_organization.sql                         — organization table
│   ├── 0003_create_app_role.sql                          — postgres app role
│   ├── 0004_add_audit_logs.sql                           — audit_logs table
│   ├── 0005_force_audit_rls.sql                          — RLS on audit_logs
│   ├── 0006_add_invitation_pending_index.sql             — invitation index
│   ├── 0007_add_processed_events.sql                     — processed_events idempotency table
│   ├── 0008_add_plan_entitlements_pk.sql                 — plan_entitlements PK-only scaffold
│   ├── 0009_add_stripe_customer_id.sql                   — stripeCustomerId column on organization
│   └── 0010_add_entitlement_columns.sql                  — adds plan/status/subscriptionId/currentPeriodEnd/cancelAtPeriodEnd/seats/lastEventAt columns
└── src/
    ├── env.ts                                            — t3-env boundary; validates all env vars at build time
    ├── proxy.ts                                          — dev CORS proxy
    ├── db/
    │   ├── index.ts                                      — Drizzle db singleton + Transaction type export
    │   ├── columns.ts                                    — shared timestamps helper
    │   ├── schema.ts                                     — app tables: emailSuppressions, processedEvents, planEntitlements
    │   ├── schema/auth.ts                                — Better Auth generated tables: user, session, account, verification, organization, member, invitation
    │   ├── audit.ts                                      — auditLogs table + AuditEvent type
    │   ├── audit-log.ts                                  — logAudit(tx, event | ExplicitAuditEvent) writer
    │   ├── tenant.ts                                     — tenantDb(orgId) RLS-scoped Drizzle client
    │   └── queries/
    │       ├── entitlements.ts                           — getEntitlement(orgId), hasActiveAccess(e) — entitlement read + decision
    │       ├── organizations.ts                          — getOrgWithOwnerEmail(orgId), setStripeCustomerId(orgId, customerId)
    │       ├── members.ts                                — member queries
    │       ├── invitations.ts                            — invitation queries
    │       └── audit.ts                                  — audit read queries
    ├── lib/
    │   ├── result.ts                                     — Result<T>, ok(), err(), isUniqueViolation()
    │   ├── auth.ts                                       — requireOrgUser() → {user, orgId, role}
    │   ├── auth-client.ts                                — Better Auth client singleton
    │   ├── auth-schema.config.ts                         — Better Auth schema config
    │   ├── logger.ts                                     — pino logger
    │   ├── problem.ts                                    — problemJson() RFC 7807 helper
    │   ├── redirects.ts                                  — redirect helpers
    │   ├── suppressions.ts                               — email suppression read
    │   ├── email.ts                                      — Resend send wrapper
    │   ├── utils.ts                                      — cn() Tailwind helper
    │   ├── auth/
    │   │   ├── authed-action.ts                          — authedAction(role, schema, fn) — the single privileged server action factory
    │   │   ├── roles.ts                                  — Role type, roleAtLeast()
    │   │   └── error-mapping.ts                          — Better Auth error code → user message map
    │   ├── billing/
    │   │   ├── index.ts                                  — barrel: exports upgrade, openPortal, requirePlan only
    │   │   ├── billing-error.ts                          — BillingError class with code union
    │   │   ├── catalog.ts                                — loadCatalog() → Catalog; PlanSlug type
    │   │   ├── catalog.json                              — lookup_key → plan slug map (course_pro_monthly → pro, course_team_monthly → team)
    │   │   ├── stripe.ts                                 — stripe singleton (pinned apiVersion '2026-05-27.dahlia'); re-exports Stripe namespace type
    │   │   ├── projection.ts                             — subscriptionToEntitlement(sub, catalog) → EntitlementPatch; EntitlementPatch type
    │   │   ├── upgrade.ts                                — upgrade server action (authedAction 'admin'): ensure Customer → resolve Price by lookup_key → checkout.sessions.create
    │   │   ├── portal.ts                                 — openPortal server action (authedAction 'admin'): billingPortal.sessions.create → return URL
    │   │   └── require-plan.ts                           — requirePlan('pro'|'team') server-only gate; throws BillingError on fail
    │   ├── webhooks/
    │   │   ├── processed-events.ts                       — claimEvent(tx, provider, eventId, eventType) → boolean
    │   │   └── stripe.ts                                 — dispatch(tx, event); onCheckoutCompleted, onSubscriptionUpdated, onSubscriptionDeleted; resolveOrgIdFromCustomer
    │   └── invitations/
    │       ├── manage.ts                                 — invitation management actions
    │       ├── send.ts                                   — send invitation email
    │       ├── url.ts                                    — build/verify invitation URL
    │       └── accept.ts                                 — accept invitation action
    ├── emails/
    │   ├── email-tailwind-config.ts                      — Tailwind config for react-email
    │   ├── components/email-layout.tsx                   — shared email layout component
    │   ├── welcome-verification.tsx                      — welcome/verification email template
    │   └── invite.tsx                                    — invitation email template
    ├── components/ui/                                    — shadcn/ui primitives (button, card, badge, input, label, select, separator, skeleton, sonner, tooltip)
    └── app/
        ├── globals.css                                   — Tailwind base styles
        ├── layout.tsx                                    — root layout
        ├── page.tsx                                      — root redirect page
        ├── _components/
        │   ├── providers.tsx                             — client providers wrapper
        │   ├── field-error.tsx                           — form field error display
        │   └── submit-button.tsx                         — form submit button with pending state
        ├── api/
        │   ├── auth/[...all]/route.ts                    — Better Auth catch-all route handler
        │   └── webhooks/stripe/route.ts                  — POST: verify signature → claimEvent in tx → dispatch
        ├── (auth)/
        │   ├── sign-up/                                  — sign-up page, form, actions
        │   ├── sign-in/                                  — sign-in page, form, actions
        │   ├── verify-email/                             — email verification page + resend
        │   └── accept-invite/                            — accept invitation page + form
        ├── onboarding/create-org/page.tsx                — org creation onboarding page
        └── (protected)/
            ├── layout.tsx                                — protected layout (auth guard)
            ├── sign-out-action.ts                        — sign-out server action
            ├── dashboard/
            │   ├── page.tsx                              — dashboard page
            │   ├── loading.tsx                           — dashboard loading skeleton
            │   └── org-switcher.tsx                      — org switcher client component
            ├── billing/success/
            │   ├── page.tsx                              — Checkout return page: read entitlement + poll until non-free
            │   ├── Poller.tsx                            — client island: router.refresh() every 2s while finalizing
            │   └── loading.tsx                           — loading skeleton
            └── inspector/
                ├── page.tsx                              — Stripe inspector page: Header, Entitlement, Events, Audit panels
                ├── loading.tsx                           — inspector loading skeleton
                ├── constants.ts                          — ACTING_USER_COOKIE constant
                ├── actions.ts                            — dev-only server actions: switchUserAction, resetAndReseedAction, forceEntitlementStatus, tamperSignature, missingHeader, replayLastEvent, forceOlderEvent, forgeMetadata
                ├── _data.ts                              — getInspectorContext() → InspectorContext (cache-deduped)
                ├── _components/
                │   ├── entitlement-panel.tsx             — EntitlementPanel: renders all planEntitlements fields with data-testids
                │   ├── checkout-button.tsx               — CheckoutButton: calls upgrade() → window.location.assign
                │   ├── portal-button.tsx                 — PortalButton: calls openPortal() → window.open; disabled w/ tooltip when no Customer
                │   ├── debug-controls.tsx                — DebugControls: dev-only force-status, tamper/missing-header, CLI-shell buttons
                │   ├── acting-user-switcher.tsx          — dev-only user switcher (swaps inspector identity via cookie)
                │   ├── audit-tail.tsx                    — AuditTail: latest 20 audit rows
                │   └── processed-events-tail.tsx         — ProcessedEventsTail: latest 20 processed_events rows
                └── pro-only/
                    ├── page.tsx                          — ProOnlyPage: calls requirePlan('pro') then renders gated content
                    ├── error.tsx                         — ProOnlyGate: error boundary; switches on BillingError.code
                    └── loading.tsx                       — loading skeleton
```

## Contracts

### src/env.ts
```ts
export const env: {
  // server
  DATABASE_URL: string;
  DATABASE_URL_UNPOOLED: string;
  SEED: number;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  EMAIL_REPLY_TO: string;
  INVITATION_SIGNING_SECRET: string;
  STRIPE_SECRET_KEY: string;        // must start with 'sk_test_'
  STRIPE_WEBHOOK_SECRET: string;    // must start with 'whsec_'
  STRIPE_PORTAL_RETURN_URL: string;
  APP_URL: string;
  // client
  NEXT_PUBLIC_APP_NAME: string;
  NEXT_PUBLIC_APP_URL: string;
}
```

### src/db/schema.ts
- `suppressionReason` pgEnum: `'hard_bounce' | 'soft_bounce_threshold' | 'complaint' | 'manual_unsubscribe'`
- `emailSuppressions` table: `id uuid PK, email text unique, reason suppressionReason, providerEventId text?, bypassUntil timestamptz?, metadata jsonb?, createdAt, updatedAt`
- `processedEvents` table: `id bigint identity PK, provider text, eventId text, eventType text, receivedAt timestamptz` — unique(provider, eventId)
- `planEntitlements` table: `organizationId text PK → organization.id, plan text enum('free','pro','team') default 'free', status text enum('trialing','active','past_due','canceled','incomplete') default 'active', subscriptionId text?, currentPeriodEnd timestamptz?, cancelAtPeriodEnd boolean default false, seats integer default 1, lastEventAt timestamptz?, updatedAt timestamptz`
- `export type PlanEntitlement`, `NewPlanEntitlement`, `ProcessedEvent`, `NewProcessedEvent`, `EmailSuppression`, `NewEmailSuppression`

### src/db/schema/auth.ts
- `user`, `session`, `account`, `verification`, `organization` (includes `stripeCustomerId text?`), `member`, `invitation` — Better Auth generated tables

### src/db/audit-log.ts
```ts
export type ExplicitAuditEvent = AuditEvent & { organizationId: string; actorUserId: string | null }
export const logAudit: (tx: Transaction, event: AuditEvent | ExplicitAuditEvent) => Promise<void>
```

### src/db/queries/entitlements.ts
```ts
export type EntitlementRow = PlanEntitlement  // alias for planEntitlements.$inferSelect
export const getEntitlement: (orgId: string) => Promise<PlanEntitlement>  // React.cache; throws on missing row
export const hasActiveAccess: (e: PlanEntitlement) => boolean  // exhaustive switch; trialing|active|past_due → true
```

### src/db/queries/organizations.ts
```ts
export const getOrgWithOwnerEmail: (orgId: string) => Promise<{ id: string; stripeCustomerId: string | null; ownerEmail: string }>
export const setStripeCustomerId: (orgId: string, customerId: string) => Promise<void>
```

### src/lib/result.ts
```ts
export type ErrorCode = 'validation' | 'conflict' | 'not_found' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'internal'
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; userMessage: string; fieldErrors?: Record<string, string[]> } }
export const ok: <T>(data: T) => Result<T>
export const err: (code: ErrorCode, userMessage: string, fieldErrors?: Record<string, string[]>) => Result<never>
export const isUniqueViolation: (e: unknown) => boolean
```

### src/lib/auth/authed-action.ts
```ts
export type AuthedCtx = { user: OrgUser; orgId: string; role: Role; db: ReturnType<typeof tenantDb>; ip: string | null; userAgent: string | null }
export const authedAction: <TSchema extends z.ZodType, TOut>(role: Role, schema: TSchema, fn: (input, ctx: AuthedCtx) => Promise<Result<TOut>>) => (_prev: Result<TOut> | null, formData: FormData) => Promise<Result<TOut>>
```

### src/lib/billing/billing-error.ts
```ts
export class BillingError extends Error {
  readonly name = 'BillingError'
  readonly code: 'no_access' | 'plan_required' | 'no_customer' | 'unknown_customer' | 'unknown_plan'
  constructor(code: BillingError['code'], userMessage: string)
}
```

### src/lib/billing/catalog.ts
```ts
export type PlanSlug = 'free' | 'pro' | 'team'
export type Catalog = { planFromLookupKey: (key: string | null | undefined) => PlanSlug | null; lookupKeys: Record<string, PlanSlug> }
export const loadCatalog: () => Catalog
```

### src/lib/billing/catalog.json
```json
{ "lookup_keys": { "course_pro_monthly": "pro", "course_team_monthly": "team" } }
```

### src/lib/billing/stripe.ts
```ts
export type { Stripe }   // re-exports Stripe namespace type; single SDK importer boundary
export const stripe: Stripe  // new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-05-27.dahlia', typescript: true })
```

### src/lib/billing/projection.ts
```ts
export type { PlanSlug }
export type EntitlementPatch = Pick<PlanEntitlement, 'plan' | 'status' | 'subscriptionId' | 'currentPeriodEnd' | 'cancelAtPeriodEnd' | 'seats'>
export const subscriptionToEntitlement: (sub: Stripe.Subscription, catalog: Catalog) => EntitlementPatch
  // reads item = sub.items.data[0]; throws BillingError('unknown_plan') if missing or lookup_key not in catalog
  // currentPeriodEnd = new Date(item.current_period_end * 1000)  — item-level, not subscription root
```

### src/lib/billing/upgrade.ts  (`'use server'`)
```ts
export const upgrade: authedAction('admin', z.strictObject({ planSlug: z.enum(['pro','team']) }), ...) => Promise<Result<{ url: string }>>
  // ensures Stripe Customer (create before local UPDATE); resolves Price by lookup_key; creates Checkout session
  // success_url: APP_URL/billing/success?session_id={CHECKOUT_SESSION_ID}
  // cancel_url: APP_URL/inspector
  // trial_period_days: 14; payment_method_collection: 'always'
```

### src/lib/billing/portal.ts  (`'use server'`)
```ts
export const openPortal: authedAction('admin', z.strictObject({ returnPath: z.string().optional() }), ...) => Promise<Result<{ url: string }>>
  // no Customer → err('forbidden', ...); else billingPortal.sessions.create({ customer, return_url })
```

### src/lib/billing/require-plan.ts  (`server-only`)
```ts
export const requirePlan: (planSlug: 'pro' | 'team') => Promise<void>
  // requireOrgUser → getEntitlement → throws BillingError('no_access') if !hasActiveAccess
  // throws BillingError('plan_required') if PLAN_RANK[e.plan] < PLAN_RANK[planSlug]
  // PLAN_RANK = { free: 0, pro: 1, team: 2 }
```

### src/lib/billing/index.ts
```ts
export { upgrade } from './upgrade'
export { openPortal } from './portal'
export { requirePlan } from './require-plan'
// No Stripe, BillingError, or catalog re-exports
```

### src/lib/webhooks/processed-events.ts  (`server-only`)
```ts
export const claimEvent: (tx: Transaction, provider: string, eventId: string, eventType: string) => Promise<boolean>
  // inserts with onConflictDoNothing; returns true = freshly claimed, false = duplicate
```

### src/lib/webhooks/stripe.ts  (`server-only`)
```ts
export const dispatch: (tx: Transaction, event: Stripe.Event) => Promise<void>
  // switch on event.type: 'checkout.session.completed' | 'customer.subscription.updated' | 'customer.subscription.deleted' | default (log unhandled)
export const resolveOrgIdFromCustomer: (tx: Transaction, stripeCustomerId: string) => Promise<string>
  // throws BillingError('unknown_customer') if no org owns the Customer
export const onCheckoutCompleted: (tx: Transaction, event: Stripe.Event) => Promise<void>
  // retrieve Subscription once; resolveOrgIdFromCustomer (authoritative); cross-check sub.metadata.organization_id; UPSERT planEntitlements; logAudit
export const onSubscriptionUpdated: (tx: Transaction, event: Stripe.Event) => Promise<void>
  // no re-fetch; project; UPDATE with ordering predicate (lastEventAt < eventAt); logAudit on non-zero result
export const onSubscriptionDeleted: (tx: Transaction, event: Stripe.Event) => Promise<void>
  // UPDATE plan='free'/status='canceled'/subscriptionId=null with ordering predicate; logAudit on non-zero result
```

### src/app/api/webhooks/stripe/route.ts
```ts
export const POST: (request: Request) => Promise<Response>
  // raw body text → constructEvent (400 on bad/missing signature) → db.transaction(claimEvent + dispatch) → 200 { received, duplicate }
```

### src/app/(protected)/inspector/_data.ts  (`server-only`)
```ts
type InspectorContext = { userId, orgId, orgName, role, stripeCustomerId, orgs, members, entitlement: EntitlementRow, processedEvents, auditLogs }
export const getInspectorContext: () => Promise<InspectorContext>  // React.cache; respects dev acting-user cookie
```

### src/app/(protected)/inspector/actions.ts  (`'use server'`, dev-only guarded)
```ts
export const switchUserAction: (_prev, formData) => Promise<Result<{ userId: string }>>
export const resetAndReseedAction: () => Promise<Result<{ reseeded: true }>>
export const forceEntitlementStatus: (_prev, formData) => Promise<Result<{ plan: string; status: string }>>
  // FIXTURE_PERIOD_END = new Date('2026-12-31T00:00:00.000Z')
  // ENTITLEMENT_PLANS = ['free', 'pro', 'team']
  // ENTITLEMENT_STATUSES = ['trialing', 'active', 'past_due', 'canceled', 'incomplete']
export const tamperSignature: () => Promise<Result<{ status: number; body: unknown }>>
export const missingHeader: () => Promise<Result<{ status: number; body: unknown }>>
export const replayLastEvent: () => Promise<Result<{ note: string }>>
export const forceOlderEvent: () => Promise<Result<{ note: string }>>
export const forgeMetadata: () => Promise<Result<{ note: string }>>
```

### src/app/(protected)/inspector/_components/entitlement-panel.tsx
```ts
export const EntitlementPanel: ({ entitlement: EntitlementRow }) => JSX.Element
  // data-testids: entitlement-panel, entitlement-plan, entitlement-status, entitlement-subscription-id, entitlement-period-end, entitlement-cancel-flag, entitlement-seats
```

### src/app/(protected)/inspector/_components/checkout-button.tsx  (`'use client'`)
```ts
export const CheckoutButton: ({ plan: 'pro' | 'team'; testId: string }) => JSX.Element
  // calls upgrade(null, formData); on ok: window.location.assign(result.data.url)
```

### src/app/(protected)/inspector/_components/portal-button.tsx  (`'use client'`)
```ts
export const PortalButton: ({ hasCustomer: boolean }) => JSX.Element
  // calls openPortal(null, new FormData()); on ok: window.open(url, '_blank')
  // disabled with Tooltip when hasCustomer=false
```

### src/app/(protected)/billing/success/Poller.tsx  (`'use client'`)
```ts
export const Poller: ({ finalizing: boolean }) => null
  // router.refresh() every 2000ms while finalizing; stops when finalizing=false
```

### src/app/(protected)/inspector/pro-only/error.tsx  (`'use client'`)
```ts
type BillingErrorLike = Error & { code?: string }
// default export: ProOnlyGate({ error: BillingErrorLike, reset: () => void })
// switches on error.code: 'no_access' → reactivate message; else → upgrade message
// data-testid: 'pro-only-gate'
```

### src/app/(protected)/inspector/constants.ts
```ts
export const ACTING_USER_COOKIE = 'inspector-acting-user'
```

## Dependencies

### Production
| Package | Version |
|---|---|
| next | 16.2.7 |
| react | 19.2.4 |
| react-dom | 19.2.4 |
| better-auth | ^1.6.14 |
| stripe | ^22.2.0 |
| drizzle-orm | ^0.45.1 |
| postgres | ^3.4.7 |
| @t3-oss/env-nextjs | ^0.13.11 |
| zod | ^4.4.3 |
| react-email | ^6.5.0 |
| resend | ^6.12.4 |
| pino | ^9.14.0 |
| next-themes | ^0.4.6 |
| sonner | ^2.0.7 |
| uuidv7 | ^1.0.2 |
| server-only | ^0.0.1 |
| lucide-react | ^1.17.0 |
| radix-ui | ^1.4.3 |
| class-variance-authority | ^0.7.1 |
| clsx | ^2.1.1 |
| tailwind-merge | ^3.6.0 |
| tw-animate-css | ^1.4.0 |

### Dev
| Package | Version |
|---|---|
| typescript | ^6.0.3 |
| @biomejs/biome | 2.4.16 |
| drizzle-kit | ^0.31.5 |
| drizzle-seed | ^0.3.1 |
| drizzle-zod | ^0.8.0 |
| tailwindcss | ^4.3.0 |
| @tailwindcss/postcss | ^4.3.0 |
| vitest | ^4.1.8 |
| tsx | ^4.20.0 |
| dotenv-cli | ^10.0.0 |
| babel-plugin-react-compiler | 1.0.0 |
| auth | ^1.6.14 |

## Start diff

The start codebase is identical in file count and names to the solution — every file exists in both. The difference is that the following files in start contain stub implementations (throw / return err) with TODO comments pointing at the lesson step that implements them:

**`src/app/api/webhooks/stripe/route.ts`**
- Start: `POST` returns `404` (empty handler, not yet wired)
- TODOs: L2 (signature verification), L3 (claim + dispatch in transaction)
- Solution: full verify → claimEvent → dispatch pipeline

**`src/lib/webhooks/stripe.ts`**
- Start: `dispatch` logs "unhandled" for all events; `resolveOrgIdFromCustomer`, `onCheckoutCompleted`, `onSubscriptionUpdated`, `onSubscriptionDeleted` all `throw new Error('not implemented')`
- TODOs: L3 (dispatch switch), L4 (resolveOrgIdFromCustomer, onCheckoutCompleted, onSubscriptionUpdated, onSubscriptionDeleted), L6 (cross-check sub.metadata.organization_id against Customer-owned org in onCheckoutCompleted)
- Solution: complete dispatch, all handlers implemented, metadata cross-check present

**`src/db/schema.ts` — `planEntitlements` table**
- Start: PK-only (`organizationId text PK`) — no plan/status/subscriptionId/currentPeriodEnd/cancelAtPeriodEnd/seats/lastEventAt/updatedAt columns
- TODO: L4 (add the canonical 064-L4 columns; run db:generate → migrate)
- Solution: full column set; new migration `0010_add_entitlement_columns.sql` present

**`src/db/queries/entitlements.ts`**
- Start: `EntitlementRow` is a hand-typed alias (not schema-derived); `getEntitlement` returns a hard-coded free placeholder object; `hasActiveAccess` always returns `false`
- TODOs: L4 (React.cache + real DB read + throw on missing; exhaustive switch for hasActiveAccess)
- Solution: `EntitlementRow = PlanEntitlement` ($inferSelect); `getEntitlement` uses React.cache + db.query.planEntitlements.findFirst + throws on missing; `hasActiveAccess` is exhaustive switch with never default

**`src/lib/billing/projection.ts`**
- Start: `EntitlementPatch` typed inline (not derived from PlanEntitlement); `subscriptionToEntitlement` throws `'not implemented'`
- TODOs: L4 (derive EntitlementPatch from schema; implement pure projection)
- Solution: `EntitlementPatch = Pick<PlanEntitlement, ...>`; full implementation reading from `sub.items.data[0]`

**`src/lib/billing/upgrade.ts`**
- Start: `authedAction` handler returns `err('internal', 'Not implemented')`
- TODO: L5 (ensure-Customer, resolve Price by lookup_key, checkout.sessions.create)
- Solution: full Checkout session creation with Customer ensure-or-create, trial, payment_method_collection

**`src/lib/billing/portal.ts`**
- Start: handler returns `err('internal', 'Not implemented')`
- TODO: L5 (no Customer → err; else billingPortal.sessions.create)
- Solution: full portal session creation with no-customer guard

**`src/lib/billing/require-plan.ts`**
- Start: always throws `BillingError('plan_required', 'Upgrade to continue.')` after requireOrgUser (no real check)
- TODO: L5 (requireOrgUser → getEntitlement → throw no_access / plan_required via PLAN_RANK)
- Solution: full PLAN_RANK comparison after real entitlement read

**`src/lib/billing/billing-error.ts`**
- Start and solution are identical in code; start has an extra TODO comment (L5 — finalize the code union) that is cosmetically present but the class itself is already complete in both
- Solution: same class, TODO comment removed

**`src/lib/billing/index.ts`**
- Start and solution are functionally identical (exports are the same); start has an extra TODO comment (L5 barrel) that is cosmetically present
- Solution: same exports, TODO comment removed

All other source files (UI components, auth, emails, invitations, seed scripts, config files) are identical between start and solution.

**Collected TODO comments from start:**

| File | TODO |
|---|---|
| `src/db/queries/entitlements.ts` | `TODO(L4)` — getEntitlement: React.cache + db findFirst, throw on missing |
| `src/db/queries/entitlements.ts` | `TODO(L4)` — hasActiveAccess: exhaustive switch |
| `src/db/schema.ts` | `TODO(L4)` — add entitlement columns (plan/status/subscriptionId/currentPeriodEnd/cancelAtPeriodEnd/seats/lastEventAt/updatedAt); db:generate → migrate |
| `src/app/api/webhooks/stripe/route.ts` | `TODO(L2)` — verify signature (raw body, constructEvent, 400 problem+json) |
| `src/app/api/webhooks/stripe/route.ts` | `TODO(L3)` — claim in one db.transaction + dispatch |
| `src/lib/billing/portal.ts` | `TODO(L5)` — openPortal: no Customer → err; else billingPortal.sessions.create |
| `src/lib/billing/require-plan.ts` | `TODO(L5)` — requirePlan: requireOrgUser → getEntitlement → throw no_access / plan_required via PLAN_RANK |
| `src/lib/billing/upgrade.ts` | `TODO(L5)` — ensure-Customer, resolve Price by lookup_key, checkout.sessions.create |
| `src/lib/billing/billing-error.ts` | `TODO(L5)` — finalize code union and wire error.tsx discrimination |
| `src/lib/billing/index.ts` | `TODO(L5)` — barrel: upgrade, openPortal, requirePlan only |
| `src/lib/billing/projection.ts` | `TODO(L4)` — derive EntitlementPatch from schema once columns land |
| `src/lib/billing/projection.ts` | `TODO(L4)` — pure projection: lookup_key → plan, status, currentPeriodEnd, cancelAtPeriodEnd, quantity |
| `src/lib/webhooks/stripe.ts` | `TODO(L3)` — exhaustive dispatch switch |
| `src/lib/webhooks/stripe.ts` | `TODO(L4)` — resolveOrgIdFromCustomer: read org WHERE stripeCustomerId = ? |
| `src/lib/webhooks/stripe.ts` | `TODO(L4)` — onCheckoutCompleted: subscriptions.retrieve, UPSERT, logAudit |
| `src/lib/webhooks/stripe.ts` | `TODO(L6)` — cross-check sub.metadata.organization_id against Customer-owned org |
| `src/lib/webhooks/stripe.ts` | `TODO(L4)` — onSubscriptionUpdated: no re-fetch, ordering predicate, logAudit on non-zero |
| `src/lib/webhooks/stripe.ts` | `TODO(L4)` — onSubscriptionDeleted: plan='free'/status='canceled', ordering predicate, logAudit |
