# Chapter 104 — Codebase Summary

## Solution file tree

```
src/
  app/
    layout.tsx                                  — Root layout: NuqsAdapter, ThemeProvider, nav, Toaster
    page.tsx                                    — Root route: redirects to /invoices
    globals.css                                 — Tailwind base styles
    _components/
      providers.tsx                             — ThemeProvider wrapper (client)
      submit-button.tsx                         — useFormStatus-aware submit button
    (app)/
      invoices/
        page.tsx                                — Invoice list page (RSC): parses URL params, calls listInvoices + getOrgInvoiceSummary
        loading.tsx                             — Skeleton loading UI for list
        fetched-at-strip.tsx                    — Cache-state display strip (listFetchedAt / summaryFetchedAt / detailFetchedAt)
        table.tsx                               — Invoice table (client): optimistic archive, useActionState per lifecycle action
        toolbar.tsx                             — Filter/sort/search toolbar (client, nuqs)
        view-tabs.tsx                           — Active / Archived / All tabs (client, nuqs)
        pagination.tsx                          — Keyset cursor pagination (client, nuqs)
        active-filter-chips.tsx                 — Active filter chip row (server)
        clear-chip.tsx                          — Per-param clear button (client, nuqs)
        [id]/edit/
          page.tsx                              — Edit invoice page (RSC): calls getInvoiceDetail, splits fetchedAt
          edit-form.tsx                         — Edit form (client): useActionState + conflict recovery + admin overwrite
          conflict-banner.tsx                   — 409 conflict UI: shows server's current row, Use latest / Overwrite buttons
          loading.tsx                           — Skeleton for edit page
      plan/
        page.tsx                                — Plan overview page (RSC): getPlanEntitlement + renewalCountdownDays
        seat-usage.tsx                          — Seat usage counter (client): deliberate state-via-effect defect
        actions.ts                              — updatePlanLabel server action (deliberate review defects)
        loading.tsx                             — Skeleton for plan page
    inspector/
      page.tsx                                  — Inspector dashboard (RSC): row counts, cache panels, audit tail, identity switcher
      loading.tsx                               — Skeleton for inspector
      actions.ts                                — Inspector utility actions: resetAndReseed, switchIdentity, forceVersionDrift
      cache-actions.ts                          — Cache-driving inspector actions: editOneInvoice, archiveOneInvoice, restoreOneInvoice, deleteOneInvoice, runSummaryJob, toggleMisuseRevalidate
      force-updatetag/
        route.ts                                — Route Handler that calls updateTag to demonstrate it throws outside Server Actions
      _components/
        cache-buttons.tsx                       — Inspector cache action buttons (server component)
        cachelife-readout.tsx                   — Lists cacheLife profile per cached function
        force-updatetag-island.tsx              — Client island that fetch()es /force-updatetag and renders the error
        hitmiss-probe.tsx                       — Static prose + link teaching hit/miss observation
        invalidation-log.tsx                    — Renders last 20 cache invalidation log entries
        misuse-toggle.tsx                       — Toggle for misuseRevalidateFromAction flag
  lib/
    utils.ts                                    — cn() helper (clsx + tailwind-merge)
    result.ts                                   — Result<T> type + ok/err/conflict constructors
    authed-action.ts                            — authedAction() wrapper: session → RBAC → parse → fn
    temporal.ts                                 — Temporal polyfill seam; exports Temporal, instantFromString, plainDateFromString
    audit-log.ts                                — logAudit(tx, event) canonical audit seam
    tenant-db.ts                                — tenantDb(orgId) scoped facade for org + plan entitlement reads/writes
    cache/
      tags.ts                                   — invoiceTags (list/record/summary) and orgPlanEntitlementTag helpers
      log.ts                                    — logCacheInvalidation(tag, source) — records to in-memory store
      profiles.ts                               — cacheProfiles map: function name → cacheLife profile string
    invoices/
      search-params.ts                          — nuqs parser definitions + invoiceListSearchParamsCache
      queries.ts                                — listInvoices, getOrgInvoiceSummary, getInvoiceDetail (all 'use cache')
      actions.ts                                — updateInvoice, archiveInvoice, restoreInvoice, softDeleteInvoice (server actions)
      scoped-query.ts                           — scopedInvoices(orgId): active/archived/includingDeleted views; InvoiceQuery type
    plan/
      get-plan-entitlement.ts                   — getPlanEntitlement(orgId): 'use cache', minutes, orgPlanEntitlementTag
      renewal-countdown.ts                      — renewalCountdownDays(renewsAt): days until renewal
      schemas.ts                                — updatePlanLabelSchema (z.strictObject), UpdatePlanLabelInput type
    analytics/
      page-view-tracker.ts                      — Module-level side-effect fetch to analytics.invalid (deliberate review defect)
  server/
    types.ts                                    — InvoiceStatus, Role, Invoice, AuditLog, Organization, PlanEntitlement types; roleAtLeast()
    session.ts                                  — getSession() (cookie-based dev session); setActingIdentity() server action
    store.ts                                    — In-memory singleton: invoices, auditLogs, organizations, planEntitlements, summaries, invalidationLog; reseed()
    jobs/
      summary-recompute.ts                      — recomputeOrgSummary({orgId}): revalidateTag (non-action), upserts summary row
  components/ui/                                — shadcn/ui primitives: button, badge, card, dialog, dropdown-menu, input, label, select, separator, skeleton, sonner
scripts/
  test-lesson.mjs                               — CLI runner: pnpm test:lesson <n> → vitest run lesson-verification/Lesson <n>.ts
lesson-verification/
  .gitkeep                                      — Placeholder; no test files shipped for this chapter
```

## Contracts

### `src/server/types.ts`
```ts
type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'
type Role = 'owner' | 'admin' | 'member'
const roleAtLeast = (role: Role, required: Role): boolean
type Invoice = { id, orgId, number, customerName, status: InvoiceStatus, total, currency, createdAt, dueAt: string|null, deletedAt: string|null, archivedAt: string|null, version: number }
type AuditLog = { id, orgId, actorUserId, action, subjectId, createdAt, subjectType?, payload? }
type Organization = { id, name, planLabel }
type PlanEntitlement = { orgId, plan, seatsAllocated, seatsUsed, renewsAt }
```

### `src/server/store.ts`
```ts
type StoreUser = { id: string; orgId: string; role: Role }
type OrgInvoiceSummary = { orgId, totalCount, totalAmount, updatedAt }
type CacheInvalidationEntry = { seq: number; tag: string; source: 'action'|'job'; firedAt: string }

export const users: StoreUser[]          // 4 seeded users (2 orgs × admin+member)
export const invoices: Invoice[]         // 45 active + 1 archived + 1 deleted for org-acme; 6 for org-globex
export const auditLogs: AuditLog[]
export const organizations: Organization[]
export const planEntitlements: PlanEntitlement[]
export const summaries: Map<string, OrgInvoiceSummary>
export const invalidationLog: CacheInvalidationEntry[]
export const misuseFlag: { misuseRevalidateFromAction: boolean }

export const findOrganization = (orgId: string): Organization | undefined
export const findPlanEntitlement = (orgId: string): PlanEntitlement | undefined
export const getSummaryRow = (orgId: string): OrgInvoiceSummary | undefined
export const upsertSummaryRow = (row: OrgInvoiceSummary): void
export const pushInvalidation = (tag: string, source: 'action'|'job'): void
export const reseed = (): void
export const findInvoice = (orgId: string, id: string): Invoice | undefined
export const pushAudit = (entry: Omit<AuditLog, 'id'|'createdAt'>): void
```

### `src/server/session.ts`
```ts
type Session = { userId: string; orgId: string; role: Role }
export const getSession = async (): Promise<Session>          // reads 'acting-identity' cookie; defaults to org-acme:admin
export const setActingIdentity = async (value: string): Promise<void>  // 'use server'
```

### `src/lib/result.ts`
```ts
type ErrorCode = 'validation'|'conflict'|'not_found'|'unauthorized'|'forbidden'|'rate_limited'|'internal'
type Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; userMessage: string; fieldErrors?: Record<string,string[]>; current?: unknown } }
export const ok = <T>(data: T): Result<T>
export const err = (code: ErrorCode, userMessage: string, fieldErrors?: Record<string,string[]>): Result<never>
export const conflict = <T>(userMessage: string, current: T): Result<never>
```

### `src/lib/authed-action.ts`
```ts
type AuthedCtx = { session: Session; orgId: string; userId: string; role: Role }
export const authedAction = <TSchema, TOut>(
  role: Role,
  schema: TSchema,
  fn: (input, ctx: AuthedCtx) => Promise<Result<TOut>>
) => async (_prev: Result<TOut>|null, formData: FormData): Promise<Result<TOut>>
```

### `src/lib/cache/tags.ts`
```ts
export const invoiceTags = {
  list:    (orgId: string): string => `org:${orgId}:invoices`,
  record:  (orgId: string, id: string): string => `org:${orgId}:invoice:${id}`,
  summary: (orgId: string): string => `org:${orgId}:summary`,
}
export const orgPlanEntitlementTag = (orgId: string): string => `org:${orgId}:plan-entitlement`
```

### `src/lib/cache/profiles.ts`
```ts
export const cacheProfiles: Record<string, { profile: string }> = {
  listInvoices:        { profile: 'minutes' },
  getInvoiceDetail:    { profile: 'minutes' },
  getOrgInvoiceSummary:{ profile: 'hours' },
}
```

### `src/lib/cache/log.ts`
```ts
export const logCacheInvalidation = (tag: string, source: 'action'|'job'): void
```

### `src/lib/invoices/scoped-query.ts`
```ts
export const activeFilter   = (inv: Invoice): boolean   // deletedAt===null && archivedAt===null
export const archivedFilter = (inv: Invoice): boolean   // archivedAt!==null && deletedAt===null

export type InvoiceQuery = {
  filter: (predicate: (inv: Invoice) => boolean) => InvoiceQuery
  sort:   (compare: (a: Invoice, b: Invoice) => number) => InvoiceQuery
  cursorAfter: (cursor: string|null) => InvoiceQuery
  take:   (n: number) => Invoice[]
  hasPrev: () => boolean
  hasMoreThan: (n: number) => boolean
  find:   (predicate: (inv: Invoice) => boolean) => Invoice | undefined
}

export const scopedInvoices = (orgId: string) => ({
  active:           () => InvoiceQuery,
  archived:         () => InvoiceQuery,
  includingDeleted: () => InvoiceQuery,
})
```

### `src/lib/invoices/search-params.ts`
```ts
export const invoiceListSearchParams   // nuqs parser definitions for status, sort, q, view, cursor
export const invoiceListSearchParamsCache  // createSearchParamsCache(invoiceListSearchParams)
```

### `src/lib/invoices/queries.ts`
```ts
type InvoiceSort = '-createdAt'|'createdAt'|'-total'|'total'|'-customer'|'customer'
type InvoiceView = 'active'|'archived'|'all'
type ListParsed = { status: InvoiceStatus|null; sort: InvoiceSort; view: InvoiceView; q: string; cursor: string|null }
type ListInvoicesArgs = { orgId, view, status, sort, q, cursor, role, pageSize? }
type ListInvoicesResult = { rows: Invoice[]; nextCursor: string|null; hasPrev: boolean }

export const listInvoices = async (args: ListInvoicesArgs): Promise<ListInvoicesResult & { fetchedAt: string }>
  // 'use cache'; cacheLife('minutes'); cacheTag(invoiceTags.list(orgId))

export const getOrgInvoiceSummary = async (orgId: string): Promise<{ totalCount, totalAmount, updatedAt, fetchedAt }>
  // 'use cache'; cacheLife('hours'); cacheTag(invoiceTags.summary(orgId))

type GetInvoiceDetailArgs = { orgId: string; id: string; role: Role }
export const getInvoiceDetail = async (args: GetInvoiceDetailArgs): Promise<(Invoice & { fetchedAt: string })|null>
  // 'use cache'; cacheLife('minutes'); cacheTag(invoiceTags.record(orgId,id), invoiceTags.list(orgId))
```

### `src/lib/invoices/actions.ts`
```ts
// All 'use server', all wrapped with authedAction
export const updateInvoice     // authedAction('member', updateInvoiceSchema, ...)  → Result<Invoice>
export const archiveInvoice    // authedAction('member', lifecycle, ...)            → Result<Invoice>
export const restoreInvoice    // authedAction('member', lifecycle, ...)            → Result<Invoice>
export const softDeleteInvoice // authedAction('admin',  lifecycle, ...)            → Result<Invoice>

// Schemas
const updateInvoiceSchema = z.strictObject({ id, customerName, status, total, version: z.coerce.number(), overwrite: z.coerce.boolean().default(false) })
const lifecycle            = z.strictObject({ id, version: z.coerce.number() })

// Every successful mutation calls invalidateInvoice(orgId, id):
//   updateTag(list) → log; updateTag(record) → log; updateTag(summary) → log; revalidatePath('/invoices')
// updateInvoice also reads misuseFlag.misuseRevalidateFromAction — if true, routes list tag through revalidateTag instead
```

### `src/lib/plan/get-plan-entitlement.ts`
```ts
export const getPlanEntitlement = async (orgId: string): Promise<(PlanEntitlement & { fetchedAt: string })|null>
  // 'use cache'; cacheLife('minutes'); cacheTag(orgPlanEntitlementTag(orgId))
```

### `src/lib/plan/renewal-countdown.ts`
```ts
export const renewalCountdownDays = (renewsAt: string): number  // Math.ceil(millisUntilRenewal / msPerDay)
```

### `src/lib/plan/schemas.ts`
```ts
export const updatePlanLabelSchema = z.strictObject({ planLabel: z.string().min(1).max(80) })
export type UpdatePlanLabelInput = z.infer<typeof updatePlanLabelSchema>
```

### `src/lib/audit-log.ts`
```ts
type AuditTx   = { orgId: string; actorUserId: string }
type AuditEvent = { action: string; subjectType?: string; subjectId?: string; payload?: Record<string,unknown> }
export const logAudit = (tx: AuditTx, event: AuditEvent): void
```

### `src/lib/tenant-db.ts`
```ts
type TenantDb = {
  query: {
    organization:    () => Organization | undefined
    planEntitlement: () => PlanEntitlement | undefined
  }
  update: {
    organizationPlanLabel: (planLabel: string) => Organization | undefined
  }
}
export const tenantDb = (orgId: string): TenantDb
```

### `src/lib/temporal.ts`
```ts
export const Temporal = globalThis.Temporal ?? TemporalPolyfill
export const instantFromString  = (s: string): Temporal.Instant
export const plainDateFromString = (s: string): Temporal.PlainDate
```

### `src/lib/analytics/page-view-tracker.ts`
```ts
// No exports. Module-level side effect: fires fetch('https://analytics.invalid/api/track', ...) on import.
export {}
```

### `src/lib/utils.ts`
```ts
export const cn = (...inputs: ClassValue[]) => string
```

### `src/app/(app)/plan/actions.ts`
```ts
// 'use server' — deliberate review target (no authedAction, no role check, bypasses tenantDb facade)
export const updatePlanLabel = async (formData: FormData): Promise<Result<Organization>>
```

### `src/server/jobs/summary-recompute.ts`
```ts
export const recomputeOrgSummary = async (input: { orgId: string }): Promise<{ orgId, totalCount, totalAmount }>
  // Zod-validates input; upserts summary row; revalidateTag(summaryTag, 'max'); logs
```

### `src/app/inspector/actions.ts`
```ts
// 'use server'
export const resetAndReseed    = async (): Promise<void>
export const switchIdentity    = async (formData: FormData): Promise<void>
export const forceVersionDrift = async (formData: FormData): Promise<void>
```

### `src/app/inspector/cache-actions.ts`
```ts
// 'use server'
export const editOneInvoice      = async (): Promise<void>
export const archiveOneInvoice   = async (): Promise<void>
export const restoreOneInvoice   = async (): Promise<void>
export const deleteOneInvoice    = async (): Promise<void>
export const runSummaryJob       = async (): Promise<void>
export const toggleMisuseRevalidate = async (): Promise<void>
```

### `src/app/inspector/force-updatetag/route.ts`
```ts
export const GET: handler   // calls updateTag inside try/catch, returns JSON {ok, message}
export const POST: handler
```

### UI components (all in `src/app/(app)/invoices/`)
```ts
FetchedAtStrip({ listFetchedAt?, summaryFetchedAt?, detailFetchedAt? })  // Server Component
InvoicesTable({ rows: Invoice[], view: InvoiceView, role: Role })         // Client — optimistic archive
Toolbar({ parsed: ListParsed })                                           // Client — nuqs filter/sort/search
ViewTabs({ parsed: ListParsed, role: Role })                              // Client — nuqs view tabs
Pagination({ cursor, nextCursor, hasPrev })                               // Client — nuqs cursor nav
ActiveFilterChips({ parsed: ListParsed })                                 // Server
ClearChip({ param: 'status'|'q'|'sort', label: string })                 // Client
EditForm({ invoice: Invoice, role: Role })                                // Client — useActionState + conflict
ConflictBanner({ current: Invoice, onUseLatest, onOverwrite, canOverwrite })  // Client
```

### Inspector UI components
```ts
CacheButtons()                                    // Server Component — posts to cache-actions
CacheLifeReadout()                                // Server — reads cacheProfiles
ForceUpdateTagIsland()                            // Client — fetch() to /force-updatetag
HitMissProbe()                                    // Server — static prose
InvalidationLog({ entries: CacheInvalidationEntry[] })  // Server
MisuseToggle({ on: boolean })                     // Server
```

### `src/app/_components/`
```ts
SubmitButton({ children, pendingLabel?, ...ButtonProps })  // Client — useFormStatus
Providers({ children: ReactNode })                          // Client — ThemeProvider wrapper
```

### `src/app/(app)/plan/seat-usage.tsx`
```ts
SeatUsage({ seatsAllocated: number, seatsUsed: number })
// Client — deliberate defect: seatsRemaining held in state + synced via useEffect
```

## Dependencies

**Runtime:**
| Package | Version |
|---|---|
| next | 16.2.7 |
| react | 19.2.4 |
| react-dom | 19.2.4 |
| nuqs | ^2.8.9 |
| zod | ^4.4.3 |
| next-themes | ^0.4.6 |
| sonner | ^2.0.7 |
| radix-ui | ^1.4.3 |
| lucide-react | ^1.17.0 |
| clsx | ^2.1.1 |
| tailwind-merge | ^3.6.0 |
| class-variance-authority | ^0.7.1 |
| temporal-polyfill | ^0.3.0 |
| tw-animate-css | ^1.4.0 |
| uuidv7 | ^1.0.2 |

**Dev:**
| Package | Version |
|---|---|
| typescript | ^6.0.3 |
| @biomejs/biome | 2.4.16 |
| tailwindcss | ^4.3.0 |
| vitest | ^4.1.8 |
| babel-plugin-react-compiler | 1.0.0 |
| @tailwindcss/postcss | ^4.3.0 |

## Start diff

**Summary:** The `start/` and `solution/` directories are byte-for-byte identical across all source files. No TODOs were found in start. This is a **read-only audit target chapter** — the student's task is to write a PR review identifying defects in the running application, not to make code changes. The codebase ships complete in both start and solution so the student has a working app to inspect in the browser before producing the written review.

**Deliberate defects present in both start and solution (the review targets):**

1. `src/app/(app)/plan/actions.ts` — `updatePlanLabel` is a bare `'use server'` function (not wrapped in `authedAction`): no role check, no rate limit, no audit log entry, bypasses `tenantDb` facade.

2. `src/app/(app)/plan/seat-usage.tsx` — `SeatUsage` holds `seatsRemaining` in local state and syncs it with a `useEffect`; the value is directly derivable from props (`seatsAllocated - seatsUsed`) — a framework-pattern misuse that can produce a one-frame lag.

3. `src/lib/analytics/page-view-tracker.ts` — fires a `fetch` at module-top-level on import; a bare `import '@/lib/analytics/page-view-tracker'` at a render boundary is an invisible side effect that fires once per cold boot regardless of rendering context.

4. `src/lib/plan/renewal-countdown.ts` — `renewalCountdownDays` assumes a fixed 24-hour day (ignores DST) and reads `Date.now()` (machine-clock drift); named in comments as review-stack territory.

5. `src/app/(app)/plan/actions.ts` — `if (!session)` guard is unreachable: `getSession()` never returns `null`/`undefined` — it throws or returns a resolved `Session`. The guard is dead code.

**No TODO comments exist anywhere in start.**

**The only file present in solution but not in start:** `lesson-verification/.gitkeep` exists only in solution (start has no `lesson-verification/` directory at all).
