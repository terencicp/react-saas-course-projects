# Chapter 100 — Codebase Summary

## Solution file tree

```
projects/Chapter 100/solution/
├── package.json                                         — project manifest; scripts, deps
├── next.config.ts                                       — Next.js config (cacheComponents, typedRoutes, reactCompiler, turbopack)
├── drizzle.config.ts                                    — drizzle-kit config; three-file schema array, snake_case casing
├── tsconfig.json                                        — TypeScript strict config; @/* path alias
├── vitest.config.ts                                     — Vitest; node env, tests/lessons/**/*.test.ts
├── biome.json                                           — Biome linter/formatter config
├── postcss.config.mjs                                   — PostCSS (tailwind)
├── components.json                                      — shadcn component registry config
├── src/
│   ├── env.ts                                           — @t3-oss/env-nextjs boundary; validates all env vars at build time
│   ├── proxy.ts                                         — Next.js middleware; cookie-presence guard for protected routes
│   ├── app/
│   │   ├── layout.tsx                                   — Root layout; Providers + Toaster
│   │   ├── page.tsx                                     — Root redirect → /invoices
│   │   ├── globals.css                                  — Tailwind global styles
│   │   ├── _components/
│   │   │   ├── providers.tsx                            — NuqsAdapter + ThemeProvider wrapper
│   │   │   ├── submit-button.tsx                        — useFormStatus-aware submit button
│   │   │   └── field-error.tsx                          — Renders first fieldErrors[name] message
│   │   ├── api/
│   │   │   ├── auth/[...all]/route.ts                   — Better Auth catch-all route handler
│   │   │   └── health/route.ts                          — Health endpoint; db ping → {ok, db}
│   │   ├── (auth)/
│   │   │   ├── sign-in/
│   │   │   │   ├── page.tsx                             — Sign-in page shell
│   │   │   │   ├── loading.tsx                          — Sign-in skeleton
│   │   │   │   ├── sign-in-form.tsx                     — Client form wired to signInAction
│   │   │   │   └── actions.ts                           — signInAction; validates → auth.api.signInEmail → redirect
│   │   │   └── sign-up/
│   │   │       ├── page.tsx                             — Sign-up page shell
│   │   │       ├── sign-up-form.tsx                     — Client form wired to signUpAction
│   │   │       └── actions.ts                           — signUpAction; validates → auth.api.signUpEmail → redirect /sign-in
│   │   ├── onboarding/
│   │   │   └── create-org/page.tsx                      — Client page; authClient.organization.create then push /dashboard
│   │   └── (protected)/
│   │       ├── layout.tsx                               — Protected layout; AppNav (email + sign-out)
│   │       ├── sign-out-action.ts                       — Server action: auth.api.signOut → redirect /sign-in
│   │       ├── dashboard/
│   │       │   ├── page.tsx                             — Dashboard; greets current user by name
│   │       │   ├── loading.tsx                          — Dashboard skeleton
│   │       │   └── org-switcher.tsx                     — Client org-switcher via authClient.organization.setActive
│   │       ├── invoices/
│   │       │   ├── page.tsx                             — Invoices list; parses URL, calls listInvoices, composes sub-components
│   │       │   ├── loading.tsx                          — Invoices skeleton
│   │       │   ├── toolbar.tsx                          — Client; status/sort selects + debounced search via nuqs
│   │       │   ├── view-tabs.tsx                        — Client; active/archived/all tabs (all hidden for non-admins)
│   │       │   ├── active-filter-chips.tsx              — Server; renders chips for active status/search/sort filters
│   │       │   ├── clear-chip.tsx                       — Client; X button clearing one nuqs param
│   │       │   ├── table.tsx                            — Client; InvoicesTable with optimistic archive + lifecycle dropdowns
│   │       │   ├── pagination.tsx                       — Client; keyset cursor prev/next via nuqs
│   │       │   └── [id]/edit/
│   │       │       ├── page.tsx                         — Edit page; loads invoice via getInvoiceDetail, mounts EditForm
│   │       │       ├── loading.tsx                      — Edit skeleton
│   │       │       ├── edit-form.tsx                    — Client; subtotal+tax fields, version round-trip, conflict resolution
│   │       │       └── conflict-banner.tsx              — Client; shows conflict row (combinedAmount), Use latest / Overwrite buttons
│   │       └── inspector/
│   │           ├── page.tsx                             — Inspector page; panels for schema, split-coverage, dual-write, audit, deployment
│   │           ├── loading.tsx                          — Inspector skeleton
│   │           ├── constants.ts                         — ACTING_USER_COOKIE constant
│   │           ├── actions.ts                           — Dev-only server actions: switchUser, resetReseed, forceVersionDrift, triggerTestError
│   │           ├── _data.ts                             — Inspector read path; raw-sql schema/money/audit probes + getInspectorContext
│   │           └── _components/
│   │               ├── acting-user-switcher.tsx         — Client; dev identity swap via switchUserAction
│   │               ├── force-version-drift.tsx          — Client; bumps invoice version for 409 demo
│   │               ├── reset-button.tsx                 — Client; triggers resetAndReseedAction
│   │               └── test-error-button.tsx            — Client; fires triggerTestError for Sentry probe
│   ├── components/ui/                                   — shadcn components: button, input, label, select, card, badge, dropdown-menu, dialog, separator, skeleton, sonner
│   ├── db/
│   │   ├── index.ts                                     — drizzle client + db export; Transaction type alias
│   │   ├── schema.ts                                    — invoices table (subtotal+tax pair, no total); Invoice/NewInvoice types
│   │   ├── schema/auth.ts                               — Better Auth generated: user/session/account/verification/organization/member/invitation
│   │   ├── audit.ts                                     — audit_logs table with RLS policies (org isolation, deny update/delete); AuditLog/AuditEvent types
│   │   ├── audit-log.ts                                 — logAudit(tx, event); server-only write helper
│   │   ├── relations.ts                                 — invoices→organization Drizzle relation
│   │   ├── tenant.ts                                    — withTenant(orgId, fn) + tenantDb(orgId) facade
│   │   ├── columns.ts                                   — timestamps reusable column group
│   │   └── queries/
│   │       ├── members.ts                               — listMembers(orgId); scoped via tenantDb
│   │       └── audit.ts                                 — auditLogCount(orgId) + recentAuditLogs(orgId)
│   └── lib/
│       ├── auth.ts                                      — betterAuth instance; SESSION_COOKIE_PREFIX, getCurrentUser, requireUser, requireOrgUser
│       ├── auth-client.ts                               — createAuthClient with organizationClient plugin
│       ├── auth-schema.config.ts                        — CLI-only generator mirror of auth.ts (no server-only)
│       ├── result.ts                                    — Result<T> type; ok/err/conflict helpers; isUniqueViolation
│       ├── redirects.ts                                 — safeNext(raw); open-redirect guard
│       ├── utils.ts                                     — cn() Tailwind class merger
│       ├── auth/
│       │   ├── authed-action.ts                         — authedAction(role, schema, fn) factory; resolve→authorize→parse→call
│       │   ├── roles.ts                                 — Role type; ROLE_RANK; roleAtLeast
│       │   └── error-mapping.ts                         — mapAuthError(error); Better Auth → Result error mapper
│       └── invoices/
│           ├── actions.ts                               — createInvoice, updateInvoice, archiveInvoice, restoreInvoice, softDeleteInvoice
│           ├── queries.ts                               — listInvoices, getInvoiceDetail; InvoiceRow/InvoiceSort/InvoiceView/ListParsed types
│           ├── scoped-query.ts                          — scopedInvoices(orgId); activeFilter/archivedFilter SQL predicates
│           ├── search-params.ts                         — nuqs invoiceListSearchParams + invoiceListSearchParamsCache
│           └── money.ts                                 — combinedAmount({subtotal,tax}); integer-cents addition, no float drift
└── tests/lessons/
    ├── Lesson 2.test.ts                                 — describe.todo (launch checklist runbook structure)
    ├── Lesson 3.test.ts                                 — describe.todo (expand: nullable subtotal+tax)
    ├── Lesson 4.test.ts                                 — describe.todo (migrate: dual-write, dual-read, backfill, promotion)
    ├── Lesson 5.test.ts                                 — describe.todo (contract: drop total)
    └── Lesson 6.test.ts                                 — describe.todo (rollback runbook structure)
```

## Contracts

### `src/env.ts`
```ts
export const env: {
  DATABASE_URL: string;          // z.url()
  DATABASE_URL_UNPOOLED: string; // z.url()
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;       // z.url()
  RESEND_API_KEY: string;        // validated-not-used
  SENTRY_DSN: string;
  APP_URL: string;               // z.url()
  NEXT_PUBLIC_APP_NAME: string;
  NEXT_PUBLIC_APP_URL: string;   // z.url()
}
```

### `src/proxy.ts`
```ts
export async function proxy(request: NextRequest): Promise<NextResponse>
export const config = { matcher: ['/dashboard/:path*', '/invoices/:path*', '/inspector/:path*', '/sign-in', '/sign-up'] }
```

### `src/db/schema.ts`
Table `invoices`:
| column | type | constraints |
|---|---|---|
| id | uuid | PK, uuidv7 default |
| organizationId | text | NOT NULL, FK → organization.id CASCADE |
| number | text | NOT NULL |
| customerName | text | NOT NULL |
| status | text enum | NOT NULL, default 'draft' |
| subtotal | numeric(12,2) | NOT NULL |
| tax | numeric(12,2) | NOT NULL |
| currency | text | NOT NULL, default 'USD' |
| createdAt | timestamptz | NOT NULL, defaultNow |
| dueAt | timestamptz | nullable |
| deletedAt | timestamptz | nullable |
| archivedAt | timestamptz | nullable |
| version | integer | NOT NULL, default 1 |

Indexes: `idx_invoices_org_status_created` (org, status, createdAt DESC); `invoices_org_number_active_unique` partial unique (org, number) WHERE deletedAt IS NULL.

```ts
export type Invoice = typeof invoices.$inferSelect
export type NewInvoice = typeof invoices.$inferInsert
```

### `src/db/schema/auth.ts`
Tables: `user`, `session` (+ activeOrganizationId), `account`, `verification`, `organization`, `member`, `invitation` plus their Drizzle relations. Generated by `auth:generate`. All ids are `text` (Better Auth base62).

### `src/db/audit.ts`
Table `audit_logs` with RLS enabled:
| column | type |
|---|---|
| id | uuid PK (uuidv7) |
| organizationId | text NOT NULL, FK → organization.id CASCADE |
| actorUserId | text nullable, FK → user.id SET NULL |
| actorIp | text nullable |
| actorUserAgent | text nullable |
| action | text NOT NULL |
| subjectType | text NOT NULL |
| subjectId | text NOT NULL |
| payload | jsonb NOT NULL default {} |
| createdAt | timestamptz NOT NULL defaultNow |

RLS policies: org-isolation permissive (using `organization_id = current_setting('app.org_id', true)`), deny-UPDATE restrictive, deny-DELETE restrictive.

```ts
export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert
export type AuditEvent = { action: string; subjectType?: string; subjectId?: string; payload?: Record<string, unknown> }
```

### `src/db/index.ts`
```ts
export const db: DrizzlePostgresClient   // snake_case casing; merged schema (invoices + auth + audit + relations)
export const dbUnpooled: typeof db       // local alias; separate direct connection in production
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
```

### `src/db/audit-log.ts`
```ts
export const logAudit: (tx: Transaction, event: AuditEvent) => Promise<void>
// server-only; derives actor/org from requireOrgUser + headers — never trusted from input
```

### `src/db/tenant.ts`
```ts
export const withTenant: <T>(orgId: string, fn: (tx: Transaction) => Promise<T>) => Promise<T>
// Sets app.org_id transaction-locally before fn; the audit_logs RLS policy requires this

export const tenantDb: (orgId: string) => {
  query: {
    member: { findMany, findFirst }   // org-scoped, preserves generic inference
    invoices: { findMany, findFirst }
  }
  insert: <T extends TenantTable>(table: T) => { values: (value: Omit<T['$inferInsert'], 'organizationId'>) => ... }
  update: <T extends TenantTable>(table: T) => { set: (value) => { where: (where?) => ... } }
  delete: <T extends TenantTable>(table: T) => { where: (where?) => ... }
}
// TENANT_TABLES = { member, invoices }
```

### `src/db/relations.ts`
```ts
export const invoicesRelations  // invoices → organization (one)
```

### `src/db/columns.ts`
```ts
export const timestamps = { createdAt: timestamp({ withTimezone: true, precision: 3 }).defaultNow().notNull() }
```

### `src/db/queries/members.ts`
```ts
export const listMembers: (orgId: string) => Promise<MemberWithUser[]>
```

### `src/db/queries/audit.ts`
```ts
export const auditLogCount: (orgId: string) => Promise<number>
export const recentAuditLogs: (orgId: string) => Promise<{ id, action, createdAt }[]>
```

### `src/lib/auth.ts`
```ts
export const SESSION_COOKIE_PREFIX: string  // '__Host-better-auth' (prod) | 'better-auth' (dev)
export const auth: BetterAuthInstance       // emailAndPassword enabled, organization plugin, nextCookies plugin
export const getCurrentUser: () => Promise<User | null>
export const requireUser: (next?: string) => Promise<User>  // redirects to /sign-in if unauthenticated
export const requireOrgUser: () => Promise<{ user: User; orgId: string; role: Role }>
// cache-deduped; redirects to /sign-in or /onboarding/create-org if no org
```

### `src/lib/auth-client.ts`
```ts
export const authClient: BetterAuthClient  // organizationClient plugin; same-origin, no baseURL
```

### `src/lib/auth-schema.config.ts`
```ts
export const auth: BetterAuthInstance  // CLI-only mirror; no server-only; no runtime-only options
```

### `src/lib/result.ts`
```ts
export type ErrorCode = 'validation' | 'conflict' | 'not_found' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'internal'
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; userMessage: string; fieldErrors?: Record<string, string[]>; current?: unknown } }
export const ok: <T>(data: T) => Result<T>
export const conflict: <T>(userMessage: string, current: T) => Result<never>
export const err: (code: ErrorCode, userMessage: string, fieldErrors?) => Result<never>
export const isUniqueViolation: (e: unknown) => boolean  // checks cause.code === '23505'
```

### `src/lib/redirects.ts`
```ts
export const safeNext: (raw: unknown) => string | undefined
// Accepts only single-/ paths; rejects //, :, non-strings
```

### `src/lib/utils.ts`
```ts
export const cn: (...inputs: ClassValue[]) => string
```

### `src/lib/auth/roles.ts`
```ts
export type Role = 'owner' | 'admin' | 'member'
export const ROLE_RANK: Record<Role, 0 | 1 | 2>  // member:0, admin:1, owner:2
export const roleAtLeast: (role: Role, required: Role) => boolean
```

### `src/lib/auth/authed-action.ts`
```ts
export type AuthedCtx = { user: OrgUser; orgId: string; role: Role; db: ReturnType<typeof tenantDb>; ip: string | null; userAgent: string | null }
export const authedAction: <TSchema extends z.ZodType, TOut>(
  role: Role,
  schema: TSchema,
  fn: (input: z.infer<TSchema>, ctx: AuthedCtx) => Promise<Result<TOut>>
) => (_prev: Result<TOut> | null, formData: FormData) => Promise<Result<TOut>>
```

### `src/lib/auth/error-mapping.ts`
```ts
export const mapAuthError: (error: unknown) => Result<never>
// INVALID_EMAIL_OR_PASSWORD → unauthorized; EMAIL_NOT_VERIFIED → forbidden; 429 → rate_limited; else → internal
```

### `src/lib/invoices/money.ts`
```ts
export const combinedAmount: (money: { subtotal: string; tax: string }) => string
// integer-cents arithmetic, returns toFixed(2) string
```

### `src/lib/invoices/scoped-query.ts`
```ts
export const activeFilter: () => SQL   // deletedAt IS NULL AND archivedAt IS NULL
export const archivedFilter: () => SQL // archivedAt IS NOT NULL AND deletedAt IS NULL
export const scopedInvoices: (orgId: string) => {
  active: () => SQL
  archived: () => SQL
  includingDeleted: () => SQL
}
```

### `src/lib/invoices/search-params.ts`
```ts
export const invoiceListSearchParams: { status, sort, q, view, cursor }  // nuqs parsers; sort defaults to '-createdAt', view defaults to 'active'
export const invoiceListSearchParamsCache: SearchParamsCache
```

### `src/lib/invoices/queries.ts`
```ts
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'
export type InvoiceSort = '-createdAt' | 'createdAt' | '-total' | 'total' | '-customer' | 'customer'
export type InvoiceView = 'active' | 'archived' | 'all'
export type ListParsed = { status: InvoiceStatus | null; sort: InvoiceSort; view: InvoiceView; q: string; cursor: string | null }
export type InvoiceRow = {
  id, organizationId, number, customerName, status: InvoiceStatus,
  subtotal: string, tax: string, currency: string,
  createdAt: Date, dueAt: Date | null, deletedAt: Date | null, archivedAt: Date | null, version: number
}
// Note: no `total` field — combined amount is derived via combinedAmount() at render
export type ListInvoicesArgs = { orgId, view, status, sort, q, cursor, role, pageSize? }
export type ListInvoicesResult = { rows: InvoiceRow[]; nextCursor: string | null; hasPrev: boolean }
export const listInvoices: (args: ListInvoicesArgs) => Promise<ListInvoicesResult>
export type GetInvoiceDetailArgs = { orgId: string; id: string; role: Role }
export const getInvoiceDetail: (args: GetInvoiceDetailArgs) => Promise<InvoiceRow | null>
```

### `src/lib/invoices/actions.ts`
```ts
// All are 'use server' authedAction wrappers returning Result<InvoiceRow>
export const createInvoice   // schema: { number, customerName, status, subtotal, tax, currency }; role: 'member'
export const updateInvoice   // schema: { id, customerName, status, subtotal, tax, version, overwrite }; role: 'member'; honest-409 on version mismatch; overwrite requires 'admin'
export const archiveInvoice  // schema: { id, version }; role: 'member'
export const restoreInvoice  // schema: { id, version }; role: 'member'
export const softDeleteInvoice // schema: { id, version }; role: 'admin'
// All run inside withTenant + logAudit co-transaction
```

### `src/app/(protected)/inspector/constants.ts`
```ts
export const ACTING_USER_COOKIE = 'inspector-acting-user'
```

### `src/app/(protected)/inspector/actions.ts`
```ts
// All dev-only (NODE_ENV gate), return Result<T>
export const switchUserAction: (_prev, formData) => Promise<Result<{ userId: string }>>
export const resetAndReseedAction: () => Promise<Result<{ reseeded: true }>>
export const switchOrgAction: (_prev, formData) => Promise<Result<{ orgId: string }>>
export const forceVersionDrift: (_prev, formData) => Promise<Result<{ id: string }>>
export const triggerTestError: (_prev) => Promise<Result<{ thrown: true }>>  // always throws
```

### `src/app/(protected)/inspector/_data.ts`
```ts
export type SchemaColumn = { name: string; nullable: boolean; dataType: string }
export type SplitCoverage = { total, withSubtotal, nullSubtotal, pct, columnPresent: boolean }
export type DualWriteRow = { id, number, subtotal: string|null, tax: string|null, total: string|null }
export type IntegrityState = { kind: 'na' } | { kind: 'ok' } | { kind: 'divergent'; rows: {id,number}[] }
export type AuditRow = { id: string; action: string; subjectId: string }
export type DeploymentEnv = { environment: string; commitSha: string; buildSource: string }
export type SwitchableOrg = { id: string; name: string }
export type SeededUser = { id: string; name: string; role: string }

export const schemaColumns: () => Promise<SchemaColumn[]>   // cache-wrapped; reads information_schema.columns for 'invoices'
export const hasColumn: (columns: SchemaColumn[], name: string) => boolean
export const splitCoverage: (orgId: string) => Promise<SplitCoverage>
export const recentMoneyRows: (orgId: string) => Promise<DualWriteRow[]>  // defensive column check
export const dataIntegrity: (orgId: string) => Promise<IntegrityState>    // returns 'na' once total is dropped
export const recentAudit: (orgId: string) => Promise<AuditRow[]>
export const deploymentEnv: () => DeploymentEnv
export const getInspectorContext: () => Promise<InspectorContext>  // cache-wrapped; ACTING_USER_COOKIE swap in dev
```

### `src/app/(auth)/sign-in/actions.ts`
```ts
export const signInAction: (_prev: Result<never>|null, formData: FormData) => Promise<Result<never>>
// Schema: { email (trim+lowercase+email), password (min 1), next? }; on success redirect to safeNext(next) ?? '/dashboard'
```

### `src/app/(auth)/sign-up/actions.ts`
```ts
export const signUpAction: (_prev: Result<never>|null, formData: FormData) => Promise<Result<never>>
// Schema: { name (min 1, max 80), email, password (min 12) }; redirect /sign-in on success; duplicate email silent
```

### `src/app/(protected)/sign-out-action.ts`
```ts
export const signOutAction: () => Promise<never>  // auth.api.signOut → redirect /sign-in
```

### `src/app/api/health/route.ts`
```ts
export const GET: () => Promise<Response>
// await connection(); db ping → 200 {ok:true, db:'up'} | 503 {ok:false, db:'down'}
```

### `src/app/api/auth/[...all]/route.ts`
```ts
export const { POST, GET }  // toNextJsHandler(auth)
```

### `src/app/_components/submit-button.tsx`
```ts
export const SubmitButton: (props: ComponentProps<typeof Button> & { children: ReactNode }) => JSX.Element
// useFormStatus pending → disabled + spinner
```

### `src/app/_components/field-error.tsx`
```ts
export const FieldError: ({ name, fieldErrors }: { name: string; fieldErrors?: Record<string, string[]> }) => JSX.Element | null
```

### `src/app/_components/providers.tsx`
```ts
export const Providers: ({ children }: { children: ReactNode }) => JSX.Element
// NuqsAdapter + ThemeProvider(system)
```

### `src/app/(protected)/dashboard/org-switcher.tsx`
```ts
export type SwitchableOrg = { id: string; name: string }
export const OrgSwitcher: ({ orgs, activeOrgId }: { orgs: SwitchableOrg[]; activeOrgId: string }) => JSX.Element
```

### `src/app/(protected)/inspector/_components/acting-user-switcher.tsx`
```ts
export type SeededUser = { id: string; name: string; role: string }
export const ActingUserSwitcher: ({ users, activeUserId }: { users: SeededUser[]; activeUserId: string }) => JSX.Element
```

### `src/app/(protected)/invoices/[id]/edit/edit-form.tsx`
```ts
export const EditForm: ({ invoice, role }: { invoice: InvoiceRow; role: Role }) => JSX.Element
// Fields: customerName, status, subtotal, tax, hidden id+version; conflict resolution with ConflictBanner
```

### `src/app/(protected)/invoices/[id]/edit/conflict-banner.tsx`
```ts
export const ConflictBanner: ({ current, onUseLatest, onOverwrite, canOverwrite }: {
  current: InvoiceRow; onUseLatest: () => void; onOverwrite: () => void; canOverwrite: boolean
}) => JSX.Element
// Displays combinedAmount(current); "Overwrite anyway" only if canOverwrite
```

### `next.config.ts`
```ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  typedRoutes: true,
  reactCompiler: true,
  turbopack: { root: __dirname },
}
```

### `drizzle.config.ts`
```ts
// schema: ['./src/db/schema.ts', './src/db/schema/auth.ts', './src/db/audit.ts']
// out: './drizzle'; dialect: 'postgresql'; casing: 'snake_case'; strict: true; verbose: true
```

## Dependencies

**Runtime:**
| package | version |
|---|---|
| next | 16.2.7 |
| react | 19.2.4 |
| react-dom | 19.2.4 |
| better-auth | ^1.6.14 |
| drizzle-orm | ^0.45.1 |
| postgres | ^3.4.7 |
| @t3-oss/env-nextjs | ^0.13.11 |
| zod | ^4.4.3 |
| nuqs | ^2.8.9 |
| uuidv7 | ^1.0.2 |
| lucide-react | ^1.17.0 |
| sonner | ^2.0.7 |
| next-themes | ^0.4.6 |
| radix-ui | ^1.4.3 |
| class-variance-authority | ^0.7.1 |
| clsx | ^2.1.1 |
| tailwind-merge | ^3.6.0 |
| tw-animate-css | ^1.4.0 |
| server-only | ^0.0.1 |

**Dev:**
| package | version |
|---|---|
| @biomejs/biome | 2.4.16 |
| typescript | ^6.0.3 |
| vitest | ^4.1.8 |
| drizzle-kit | ^0.31.5 |
| drizzle-zod | ^0.8.0 |
| drizzle-seed | ^0.3.1 |
| tailwindcss | ^4.3.0 |
| @tailwindcss/postcss | ^4.3.0 |
| tsx | ^4.20.0 |
| dotenv-cli | ^10.0.0 |
| babel-plugin-react-compiler | 1.0.0 |
| auth | ^1.6.14 |
| @types/node | ^25.9.1 |
| @types/react | ^19.2.16 |
| @types/react-dom | ^19.2.3 |

## Start diff

The start and solution share the same file set — no files are added or removed. The entire diff is confined to the **money column shape** in the invoices schema and every surface that reads or writes it.

**`src/db/schema.ts`**
- Start: `total: numeric('total', { precision: 12, scale: 2 }).notNull()` — single combined column; no `subtotal`, no `tax`.
- Solution: `subtotal: numeric('subtotal', {...}).notNull()` + `tax: numeric('tax', {...}).notNull()` — pair replaces `total`; `total` column is gone.
- Start TODOs:
  - `// TODO(L3) — add subtotal + tax nullable numeric(12,2)`
  - `// TODO(L4) — promote subtotal/tax to NOT NULL after backfill`
  - `// TODO(L5) — drop the total column`

**`src/lib/invoices/queries.ts`**
- Start: `InvoiceRow` has `total: string`; `listInvoices`/`getInvoiceDetail` select `invoices.total`; `orderBy` for `-total`/`total` sorts on `invoices.total`.
- Solution: `InvoiceRow` has `subtotal: string` + `tax: string` (no `total`); sort expressions use `sql\`(${invoices.subtotal} + ${invoices.tax})\`` (`amountExpr`).
- Start TODOs:
  - `// TODO(L4) — dual-read: surface subtotal/tax via coalesce(subtotal,total) / coalesce(tax,0)`
  - `// TODO(L5) — return subtotal/tax directly, drop the coalesce and the total field`

**`src/lib/invoices/actions.ts`**
- Start: `createInvoiceSchema` has `total: z.string().min(1)`; `updateInvoiceSchema` has `total`; `rowToInvoice` maps `total`; writes single `total` column.
- Solution: schemas have `subtotal` + `tax`; `rowToInvoice` maps the pair; writes two columns.
- Start TODOs (appear twice, on createInvoice and updateInvoice):
  - `// TODO(L4) — dual-write: accept subtotal+tax, write all three in one .set, legacy-amount fallback`
  - `// TODO(L5) — contract: accept only subtotal+tax, drop the total write + fallback`

**`src/lib/invoices/money.ts`**
- Start: file does not exist.
- Solution: new file; exports `combinedAmount({subtotal, tax})`.

**`src/app/(protected)/invoices/[id]/edit/edit-form.tsx`**
- Start: single `<Input name="total" data-testid="total-input" />` field.
- Solution: two fields `<Input name="subtotal" data-testid="subtotal-input" />` + `<Input name="tax" data-testid="tax-input" />`.
- Start TODOs:
  - `{/* TODO(L4) — split Amount into Subtotal + Tax inputs */}`
  - `{/* TODO(L5) — retire any remaining combined-amount affordance */}`

**`src/app/(protected)/invoices/[id]/edit/conflict-banner.tsx`**
- Start: renders `{current.currency} {current.total}` (raw column value).
- Solution: renders `{current.currency} {combinedAmount(current)}` (derived via money helper).

**`src/app/(protected)/invoices/table.tsx`**
- Start: renders `{row.currency} {row.total}` for the Total column.
- Solution: renders `{row.currency} {combinedAmount(row)}`.

All other files (`tsconfig.json`, `next.config.ts`, `drizzle.config.ts`, `vitest.config.ts`, `biome.json`, auth files, DB files, UI components, inspector, auth pages, dashboard, middleware) are identical between start and solution.
