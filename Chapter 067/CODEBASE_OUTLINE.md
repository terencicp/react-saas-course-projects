# Chapter 067 — Codebase Summary

## Solution file tree

```
projects/Chapter 067/solution/
├── trigger.config.ts                            Trigger.dev v4 project config (dirs, maxDuration, retries)
├── drizzle.config.ts                            Drizzle Kit config
├── next.config.ts                               Next.js config
├── tsconfig.json                                TypeScript config
├── biome.json                                   Biome lint/format config
├── vitest.config.ts                             Vitest config
├── components.json                              shadcn/ui config
├── postcss.config.mjs                           PostCSS config
├── package.json                                 Deps manifest (name: chapter-067-durable-csv-export)
├── trigger/
│   ├── export-invoices.ts                       Parent durable task: count→page loop→email child→close tx
│   ├── paginate-page.ts                         Child task: one page of invoices → CSV fragment
│   └── send-export-email.ts                     Child task: lookup recipient, render ExportReadyEmail, sendEmail
└── src/
    ├── env.ts                                   T3 env boundary; validates all server + client env vars
    ├── proxy.ts                                 Dev proxy wiring
    ├── db/
    │   ├── index.ts                             Drizzle db instance + Transaction type
    │   ├── schema.ts                            invoices, exports, emailSuppressions tables + types
    │   ├── audit.ts                             auditLogs table + RLS policies + AuditEvent type
    │   ├── audit-log.ts                         logAudit() writer (session + explicit-context overloads)
    │   ├── tenant.ts                            tenantDb() facade + withTenant() tx helper
    │   ├── columns.ts                           Shared column helpers (timestamps)
    │   ├── schema/
    │   │   └── auth.ts                          Better Auth generated schema (user, org, member, etc.)
    │   └── queries/
    │       ├── invoices.ts                      listInvoices() (cursor pagination) + countInvoices()
    │       ├── audit.ts                         recentAuditLogs() + auditLogCount()
    │       ├── members.ts                       Member queries
    │       └── invitations.ts                   Invitation queries
    ├── lib/
    │   ├── result.ts                            Result<T> union, ok(), err(), isUniqueViolation()
    │   ├── trigger-client.ts                    retrieveRun() + listRunsForOrg() wrappers over Trigger.dev REST
    │   ├── auth.ts                              Better Auth server instance + requireOrgUser()
    │   ├── auth-client.ts                       Better Auth client
    │   ├── auth-schema.config.ts                Auth schema config
    │   ├── email.ts                             sendEmail() with suppression check
    │   ├── suppressions.ts                      Suppression-list read helpers
    │   ├── logger.ts                            Pino logger
    │   ├── redirects.ts                         Auth redirect helpers
    │   ├── utils.ts                             cn() utility
    │   ├── auth/
    │   │   ├── authed-action.ts                 authedAction() Server Action factory
    │   │   ├── roles.ts                         Role type + roleAtLeast()
    │   │   └── error-mapping.ts                 Better Auth error → user message map
    │   ├── exports/
    │   │   ├── start.ts                         startExport() Server Action (trigger fire-and-forget)
    │   │   ├── to-csv.ts                        rowsToCsv() pure projection (Invoice[] → RFC-4180 string)
    │   │   ├── day-bucket.ts                    dayBucket() → YYYY-MM-DD UTC string
    │   │   └── errors.ts                        ExportError class (code: EMPTY_RESULTSET | UNKNOWN_PLAN)
    │   └── invitations/
    │       ├── manage.ts                        Invitation CRUD
    │       ├── send.ts                          Invitation email sender
    │       ├── accept.ts                        Invitation accept handler
    │       └── url.ts                           Invitation URL builder
    ├── emails/
    │   ├── ExportReadyEmail.tsx                 Export-ready notification email component
    │   ├── welcome-verification.tsx             Welcome/verification email
    │   ├── invite.tsx                           Invitation email
    │   ├── email-tailwind-config.ts             Shared Tailwind config for emails
    │   └── components/
    │       └── email-layout.tsx                 Shared email layout wrapper
    ├── app/
    │   ├── layout.tsx                           Root layout
    │   ├── page.tsx                             Root redirect page
    │   ├── globals.css                          Global styles
    │   ├── _components/
    │   │   ├── providers.tsx                    Client providers wrapper
    │   │   ├── field-error.tsx                  Form field error display
    │   │   └── submit-button.tsx                Submit button with pending state
    │   ├── api/
    │   │   ├── auth/[...all]/route.ts           Better Auth catch-all route
    │   │   └── exports/[runId]/route.ts         GET /api/exports/[runId] — run state poller endpoint
    │   ├── (auth)/
    │   │   ├── sign-up/                         Sign-up page, form, actions
    │   │   ├── sign-in/                         Sign-in page, form, actions
    │   │   ├── verify-email/                    Email verification page + resend
    │   │   └── accept-invite/                   Invitation accept page + form
    │   ├── (protected)/
    │   │   ├── layout.tsx                       Auth-guarded layout
    │   │   ├── sign-out-action.ts               Sign-out Server Action
    │   │   ├── dashboard/                       Dashboard page + org switcher
    │   │   └── inspector/
    │   │       ├── page.tsx                     Export inspector page (Suspense-wrapped panels)
    │   │       ├── _data.ts                     getInspectorContext(), recentExports(), latestExport()
    │   │       ├── actions.ts                   simulateRun(), resetExports(), switchIdentity() (dev-only)
    │   │       ├── constants.ts                 ACTING_USER_COOKIE constant
    │   │       └── _components/
    │   │           ├── run-console.tsx          Client: Export button + action state + RunPanel host
    │   │           ├── run-panel.tsx            Client: live poller + seeded fallback display
    │   │           ├── debug-controls.tsx       Client: simulate/reset buttons (dev-only)
    │   │           └── acting-user-switcher.tsx Client: dev identity swap Select
    │   └── onboarding/
    │       └── create-org/page.tsx              Org creation onboarding page
    └── components/ui/                           shadcn/ui primitives (button, card, badge, progress, etc.)
```

## Contracts

### trigger/export-invoices.ts
```ts
export const exportQueue: Queue  // { name: 'export', concurrencyLimit: 1 }

// schemaTask payload: { organizationId: string (min 1), requestedBy: string (min 1) }
// queue: exportQueue, retry: { maxAttempts: 3 }
// Returns: { ok: true, runId: string, rowCount: number }
export const exportInvoices: SchemaTask<...>

const PAGE_SIZE = 500
```

### trigger/paginate-page.ts
```ts
// schemaTask payload: { organizationId: string, page: int>=0, cursor: string | null }
// Returns: { csv: string, nextCursor: string | null, rowCount: number }
export const paginatePage: SchemaTask<...>
```

### trigger/send-export-email.ts
```ts
// schemaTask payload: { organizationId: string, recipientUserId: string, rowCount: int, downloadUrl: string }
// Returns: Result<{ id: string }>  (err Result on suppression, not a throw)
export const sendExportEmail: SchemaTask<...>
```

### src/lib/exports/start.ts
```ts
// authedAction('member', z.strictObject({}), ...)
// Inserts exports row (status: 'queued'), fires tasks.trigger('export-invoices') with
// concurrencyKey: orgId, idempotencyKey (global scope, 24h TTL), updates row runId.
// Returns: Result<{ runId: string }>
export const startExport: (prev: Result<{runId:string}> | null, formData: FormData) => Promise<Result<{ runId: string }>>
```

### src/lib/exports/to-csv.ts
```ts
const COLUMNS = ['id','number','customerName','status','total','currency','createdAt','dueAt'] as const
export const rowsToCsv = (rows: Invoice[]): string  // RFC-4180, CRLF line endings
```

### src/lib/exports/day-bucket.ts
```ts
export const dayBucket = (): string  // → 'YYYY-MM-DD' (UTC)
```

### src/lib/exports/errors.ts
```ts
export class ExportError extends Error {
  override readonly name = 'ExportError'
  readonly code: 'EMPTY_RESULTSET' | 'UNKNOWN_PLAN'
  constructor(code: ExportError['code'], message: string)
}
```

### src/lib/trigger-client.ts
```ts
export type RunState = {
  status: string
  metadata: Record<string, unknown>
  output: unknown
  attemptCount: number
  completedAt: Date | null
  error: { message: string } | null
}
export const retrieveRun = async (runId: string): Promise<RunState>
export const listRunsForOrg = async (orgId: string): Promise<{ id: string; status: string; tags: string[] }[]>
```

### src/app/api/exports/[runId]/route.ts
```ts
// GET /api/exports/[runId]
// Returns: { status, metadata, attemptCount, completedAt, error } | 502 on failure
export const GET: (request: Request, { params }: { params: Promise<{ runId: string }> }) => Promise<Response>
```

### src/db/schema.ts
```ts
// suppressionReason enum: 'hard_bounce' | 'soft_bounce_threshold' | 'complaint' | 'manual_unsubscribe'
export const emailSuppressions  // table: id(uuid), email(text unique), reason, providerEventId, bypassUntil, metadata, ...timestamps
export type EmailSuppression, NewEmailSuppression

export const invoices  // table: id(uuid/uuidv7), organizationId(text→organization.id), number, customerName,
                       // status(draft|sent|paid|overdue), total(numeric), currency, createdAt, dueAt
                       // index: idx_invoices_org_created on (organizationId, createdAt desc)
export type Invoice, NewInvoice

export const exports   // table: id(uuid/uuidv7), organizationId(text→organization.id), requestedBy(text→user.id),
                       // status(queued|running|completed|failed default queued), runId(text), rowCount(int),
                       // idempotencyKey(text), dayBucket(text), pagesDone(int), pagesTotal(int),
                       // downloadUrl(text), requestedAt, completedAt
                       // uniqueIndex: exports_org_requester_day_unique on (organizationId, requestedBy, dayBucket)
export type ExportRow, NewExportRow
```

### src/db/audit.ts
```ts
export const auditLogs  // table: id(uuid/uuidv7), organizationId(text→org.id), actorUserId(text→user.id nullable),
                        // actorIp, actorUserAgent, action, subjectType, subjectId, payload(jsonb), createdAt
                        // indexes: idx_audit_logs_org_created, idx_audit_logs_org_actor_created
                        // RLS: org_isolation (SET LOCAL app.org_id), no_update, no_delete
export type AuditLog, NewAuditLog
export type AuditEvent = { action: string; subjectType?: string; subjectId?: string; payload?: Record<string, unknown> }
```

### src/db/audit-log.ts
```ts
export type ExplicitAuditEvent = AuditEvent & { organizationId: string; actorUserId: string | null }
// Two call shapes: session-derived (AuditEvent only) or explicit context (ExplicitAuditEvent)
export const logAudit = async (tx: Transaction, event: AuditEvent | ExplicitAuditEvent): Promise<void>
```

### src/db/tenant.ts
```ts
export const withTenant = async <T>(orgId: string, fn: (tx: Transaction) => Promise<T>): Promise<T>
// Sets set_config('app.org_id', orgId, true) transaction-local before calling fn

// TENANT_TABLES = { member, invitation, invoices, exports }
export const tenantDb = (orgId: string) => ({
  query: { member, invitation, invoices, exports }  // all findMany/findFirst scoped with org predicate as OUTER AND
  insert: <T extends TenantTable>(table: T) => { values: (value: Omit<T['$inferInsert'], 'organizationId'>) => ... }
  update: <T extends TenantTable>(table: T) => { set: (value) => { where: (where?) => ... } }
  delete: <T extends TenantTable>(table: T) => { where: (where?) => ... }
  transaction: <T>(fn: (tx: Transaction) => Promise<T>) => Promise<T>  // delegates to withTenant
})
```

### src/db/queries/invoices.ts
```ts
export type InvoiceView = 'active'
export type ListInvoicesArgs = { orgId: string; view: InvoiceView; cursor: string | null; pageSize?: number }
export type ListInvoicesResult = { rows: Invoice[]; nextCursor: string | null }
export const listInvoices = async (args: ListInvoicesArgs): Promise<ListInvoicesResult>  // createdAt-desc cursor pagination via tenantDb
export const countInvoices = async ({ orgId }: { orgId: string }): Promise<number>
```

### src/db/queries/audit.ts
```ts
export const auditLogCount = async (orgId: string): Promise<number>
export const recentAuditLogs = async (orgId: string): Promise<{ id, action, createdAt }[]>  // limit 20, newest first via withTenant
```

### src/app/(protected)/inspector/_data.ts
```ts
export type InspectorContext = {
  userId: string; orgId: string; orgName: string; role: Role
  orgs: { id: string; name: string }[]; members: { id: string; name: string; role: string }[]
}
export const getInspectorContext: () => Promise<InspectorContext>  // React cache(); dev: honours ACTING_USER_COOKIE
export const recentExports: (orgId: string, limit?: number) => Promise<ExportRow[]>  // newest first
export const latestExport: (orgId: string) => Promise<ExportRow | null>
```

### src/app/(protected)/inspector/actions.ts
```ts
export type SimulateState = 'queued' | 'running' | 'completed'
export const simulateRun: (prev: Result<{state}> | null, formData: FormData) => Promise<Result<{ state: SimulateState }>>  // dev-only
export const resetExports: () => Promise<Result<{ reset: true }>>  // dev-only, clears + re-seeds
export const switchIdentity: (prev: Result<{userId}> | null, formData: FormData) => Promise<Result<{ userId: string }>>  // dev-only cookie
```

### src/app/(protected)/inspector/constants.ts
```ts
export const ACTING_USER_COOKIE = 'inspector-acting-user'
```

### src/app/(protected)/inspector/_components/run-panel.tsx
```ts
export type SeededRunState = {
  runId: string | null; status: 'queued' | 'running' | 'completed' | 'failed'
  pagesDone: number | null; pagesTotal: number | null; attempt: number | null; downloadUrl: string | null
}
// Props: { activeRunId: string | null; seeded: SeededRunState | null }
// Polls /api/exports/[activeRunId] every 1s when activeRunId set; falls back to seeded
export const RunPanel: (props: RunPanelProps) => JSX.Element
```

### src/app/(protected)/inspector/_components/run-console.tsx
```ts
// Props: { seeded: SeededRunState | null; identitySwitcher?: ReactNode }
// Holds active runId state; fires startExport via useActionState; passes runId to RunPanel
export const RunConsole: (props: RunConsoleProps) => JSX.Element
```

### src/app/(protected)/inspector/_components/debug-controls.tsx
```ts
export const DebugControls: () => JSX.Element  // dev-only; simulate queued/running/completed + reset
```

### src/app/(protected)/inspector/_components/acting-user-switcher.tsx
```ts
export type SeededUser = { id: string; name: string; role: string }
// Props: { users: SeededUser[]; activeUserId: string }
export const ActingUserSwitcher: (props: ActingUserSwitcherProps) => JSX.Element  // dev-only identity swap
```

### src/emails/ExportReadyEmail.tsx
```ts
export type ExportReadyEmailProps = { orgName: string; rowCount: number; downloadUrl: string }
export default ExportReadyEmail: (props: ExportReadyEmailProps) => JSX.Element
// ExportReadyEmail.PreviewProps: ExportReadyEmailProps  (preview stub)
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
// Factory: resolve → authorize (roleAtLeast) → parse (zod) → call fn
export const authedAction: <TSchema, TOut>(role: Role, schema: TSchema, fn: (input, ctx: AuthedCtx) => Promise<Result<TOut>>) => (prev, formData) => Promise<Result<TOut>>
```

### src/env.ts
```ts
export const env  // createEnv validated object
// server: DATABASE_URL, DATABASE_URL_UNPOOLED, SEED, BETTER_AUTH_SECRET, BETTER_AUTH_URL,
//         RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO, INVITATION_SIGNING_SECRET,
//         TRIGGER_SECRET_KEY (startsWith 'tr_'), TRIGGER_PROJECT_REF (startsWith 'proj_'), APP_URL
// client: NEXT_PUBLIC_APP_NAME, NEXT_PUBLIC_APP_URL
```

### trigger.config.ts
```ts
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_placeholder',
  dirs: ['./trigger'],
  runtime: 'node',
  maxDuration: 300,
  retries: { default: { maxAttempts: 3, factor: 1.8, minTimeoutInMs: 1000, maxTimeoutInMs: 60_000, randomize: true } }
})
```

## Dependencies

**Runtime:**
- `next` 16.2.7
- `react` / `react-dom` 19.2.4
- `@trigger.dev/sdk` ^4.0.0
- `better-auth` ^1.6.14
- `drizzle-orm` ^0.45.1
- `postgres` ^3.4.7
- `zod` ^4.4.3
- `react-email` ^6.5.0
- `resend` ^6.12.4
- `@t3-oss/env-nextjs` ^0.13.11
- `pino` ^9.14.0
- `uuidv7` ^1.0.2
- `sonner` ^2.0.7
- `radix-ui` ^1.4.3
- `lucide-react` ^1.17.0
- `next-themes` ^0.4.6
- `class-variance-authority` ^0.7.1
- `clsx` ^2.1.1
- `tailwind-merge` ^3.6.0
- `tw-animate-css` ^1.4.0
- `server-only` ^0.0.1

**Dev:**
- `@biomejs/biome` 2.4.16
- `@react-email/ui` ^6.5.0
- `@tailwindcss/postcss` ^4.3.0
- `drizzle-kit` ^0.31.5
- `drizzle-zod` ^0.8.0
- `drizzle-seed` ^0.3.1
- `tailwindcss` ^4.3.0
- `trigger.dev` ^4.0.0
- `typescript` ^6.0.3
- `vitest` ^4.1.8
- `tsx` ^4.20.0
- `babel-plugin-react-compiler` 1.0.0
- `dotenv-cli` ^10.0.0

## Start diff

The start and solution share identical file trees — no files are added or removed. All differences are confined to the three task files and the `startExport` action:

**`trigger/export-invoices.ts`** — start has a stub body (`metadata.set('pagesDone', 0); return { ok: true }`). Solution adds the full implementation: `countInvoices` → `AbortTaskRunError` on empty, sequential `paginatePage.triggerAndWait` loop with per-page idempotency keys, `metadata.set` progress, `sendExportEmail.triggerAndWait` child keyed by `[orgId, 'export-email']`, and a closing `tenantDb(organizationId).transaction` that updates the exports row to `completed` and calls `logAudit`.

**`trigger/paginate-page.ts`** — start throws `new Error('not implemented')`. Solution calls `listInvoices({ orgId, view: 'active', cursor, pageSize: 500 })` and returns `{ csv: rowsToCsv(rows), nextCursor, rowCount }`.

**`trigger/send-export-email.ts`** — start throws `new Error('not implemented')`. Solution adds `tenantDb` lookups for the recipient member and org name, renders `ExportReadyEmail`, calls `sendEmail`, returns the suppressed `err` Result instead of throwing.

**`src/lib/exports/start.ts`** — start returns `err('internal', 'Not implemented')`. Solution inserts an `exports` row (status `queued`, `dayBucket`), calls `tasks.trigger<typeof exportInvoices>('export-invoices', payload, { concurrencyKey, idempotencyKey (global/24h), tags })`, updates the row's `runId`, and returns `ok({ runId: handle.id })`.

**TODO comments in start (all in the four files above):**
- `export-invoices.ts` line 22: `TODO(L2) — confirm the boundary (queue at module scope, strictObject payload, retry)`
- `export-invoices.ts` line 23: `TODO(L3) — count→pagesTotal, sequential paginatePage.triggerAndWait loop (.unwrap()) with per-page idempotencyKeys.create([orgId,'page',String(page)]), metadata progress, AbortTaskRunError on empty`
- `export-invoices.ts` line 24: `TODO(L4) — sendExportEmail child keyed by [orgId,'export-email'], then one tenantDb transaction: update exports to completed + logAudit export.invoices.completed (actorUserId null)`
- `paginate-page.ts` line 14: `TODO(L3) — listInvoices({ orgId, view: 'active', cursor, pageSize: 500 }) → { csv: rowsToCsv(rows), nextCursor, rowCount }`
- `send-export-email.ts` line 12: `TODO(L4) — tenantDb lookups (org name + recipient email), render ExportReadyEmail, sendEmail; suppression returns the err Result, not a throw`
- `start.ts` line 12: `TODO(L2) — insert exports row (status queued, dayBucket), tasks.trigger export-invoices with concurrencyKey: orgId + idempotencyKeys.create([orgId,userId,dayBucket()],{scope:'global'}) + idempotencyKeyTTL 24h, update row runId, return ok({ runId })`
