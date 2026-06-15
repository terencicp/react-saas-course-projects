# Chapter 073 — Codebase Summary

## Solution file tree

```
src/
  app/
    layout.tsx                              Root layout: NuqsAdapter, ThemeProvider, nav links
    page.tsx                                Redirect / → /invoices
    globals.css                             Tailwind base styles
    _components/
      providers.tsx                         Client ThemeProvider wrapper
      submit-button.tsx                     useFormStatus-aware submit button
    (app)/invoices/
      page.tsx                              Server page: parse URL params, call listInvoices + getOrgInvoiceSummary
      loading.tsx                           Skeleton loading state for invoice list
      fetched-at-strip.tsx                  Server component: renders fetchedAt timestamps from cached reads
      toolbar.tsx                           Client: status/sort selects + debounced search input (nuqs)
      view-tabs.tsx                         Client: Active/Archived/All tab switcher (RBAC-gated All tab)
      active-filter-chips.tsx               Server: displays active filter badges with clear buttons
      clear-chip.tsx                        Client: X button that clears one URL search param
      pagination.tsx                        Client: First Page / Next cursor-based pagination (nuqs)
      table.tsx                             Client: invoice rows, optimistic archive, useActionState lifecycle actions
      (app)/invoices/[id]/edit/
        page.tsx                            Server page: fetch detail, split fetchedAt off, render EditForm
        loading.tsx                         Skeleton loading state for edit form
        edit-form.tsx                       Client: uncontrolled form, conflict detection, Use Latest / Overwrite
        conflict-banner.tsx                 Client: 409 conflict surface with Use Latest + Overwrite buttons
    inspector/
      page.tsx                              Server page: raw store counts, cache panels, identity switcher, audit tail
      loading.tsx                           Skeleton loading state for inspector
      actions.ts                            'use server': resetAndReseed, switchIdentity, forceVersionDrift
      cache-actions.ts                      'use server': editOneInvoice, archiveOneInvoice, restoreOneInvoice, deleteOneInvoice, runSummaryJob, toggleMisuseRevalidate
      force-updatetag/
        route.ts                            Route Handler: calls updateTag to demonstrate it throws outside Server Actions
      _components/
        cachelife-readout.tsx               Server: reads cacheProfiles map, renders profile per function
        cache-buttons.tsx                   Server: forms wired to cache-actions.ts server actions
        invalidation-log.tsx                Server: renders CacheInvalidationEntry[] tail
        hitmiss-probe.tsx                   Server: explains fetchedAt hit/miss signal, links to /invoices
        force-updatetag-island.tsx          Client: fetches /inspector/force-updatetag, renders thrown error message
        misuse-toggle.tsx                   Server: toggle form for misuseRevalidateFromAction flag
  lib/
    utils.ts                                cn() helper (clsx + tailwind-merge)
    result.ts                               Result<T> type, ok/err/conflict constructors
    authed-action.ts                        authedAction() higher-order server action wrapper
    cache/
      tags.ts                               invoiceTags: list/record/summary tag string helpers
      profiles.ts                           cacheProfiles: maps function name → cacheLife profile string
      log.ts                                logCacheInvalidation(): records invalidation to store
    invoices/
      search-params.ts                      nuqs parsers + invoiceListSearchParamsCache
      scoped-query.ts                       scopedInvoices(): tenant-scoped fluent query builder
      queries.ts                            listInvoices, getOrgInvoiceSummary, getInvoiceDetail — all 'use cache'
      actions.ts                            updateInvoice, archiveInvoice, restoreInvoice, softDeleteInvoice
  server/
    types.ts                                Invoice, AuditLog, InvoiceStatus, Role types; roleAtLeast()
    session.ts                              getSession(), setActingIdentity() — cookie-based dev identity
    store.ts                                In-memory store: invoices, auditLogs, summaries, invalidationLog, misuseFlag; reseed()
    jobs/
      summary-recompute.ts                  recomputeOrgSummary(): recomputes summary, upserts row, revalidateTag
  components/ui/                            shadcn/ui primitives (button, badge, card, dialog, dropdown-menu, input, label, select, separator, skeleton, sonner)
next.config.ts                              cacheComponents:true, typedRoutes, reactCompiler, turbopack
tsconfig.json                               strict, noUncheckedIndexedAccess, bundler moduleResolution
biome.json                                  Biome linter/formatter config
vitest.config.ts                            Vitest test config
```

## Contracts

### `src/server/types.ts`
```ts
type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'
type Role = 'owner' | 'admin' | 'member'
roleAtLeast(role: Role, required: Role): boolean
type Invoice = { id, orgId, number, customerName, status, total, currency, createdAt, dueAt, archivedAt, deletedAt, version }
type AuditLog = { id, orgId, actorUserId, action, subjectId, createdAt }
```

### `src/server/store.ts`
```ts
type StoreUser = { id: string; orgId: string; role: Role }
type OrgInvoiceSummary = { orgId, totalCount, totalAmount, updatedAt }
type CacheInvalidationEntry = { seq: number; tag: string; source: 'action'|'job'; firedAt: string }

export const users: StoreUser[]                          // seeded: 4 identities (2 orgs × 2 roles)
export const invoices: Invoice[]                         // mutable; seeded: 45 acme + specials + 6 globex
export const auditLogs: AuditLog[]
export const summaries: Map<string, OrgInvoiceSummary>
export const invalidationLog: CacheInvalidationEntry[]
export const misuseFlag: { misuseRevalidateFromAction: boolean }

getSummaryRow(orgId: string): OrgInvoiceSummary | undefined
upsertSummaryRow(row: OrgInvoiceSummary): void
pushInvalidation(tag: string, source: 'action'|'job'): void
reseed(): void                                           // idempotent; clears + re-seeds all arrays + flag
findInvoice(orgId: string, id: string): Invoice | undefined
pushAudit(entry: Omit<AuditLog, 'id'|'createdAt'>): void
```

### `src/server/session.ts`
```ts
type Session = { userId: string; orgId: string; role: Role }
getSession(): Promise<Session>               // reads 'acting-identity' cookie; default 'org-acme:admin'
setActingIdentity(value: string): Promise<void>  // 'use server'; writes cookie
```

### `src/lib/result.ts`
```ts
type ErrorCode = 'validation'|'conflict'|'not_found'|'unauthorized'|'forbidden'|'rate_limited'|'internal'
type Result<T> = { ok: true; data: T } | { ok: false; error: { code, userMessage, fieldErrors?, current? } }
ok<T>(data: T): Result<T>
err(code, userMessage, fieldErrors?): Result<never>
conflict<T>(userMessage, current: T): Result<never>     // sets code:'conflict', attaches current row
```

### `src/lib/authed-action.ts`
```ts
type AuthedCtx = { session: Session; orgId: string; userId: string; role: Role }
authedAction<TSchema, TOut>(
  role: Role,
  schema: ZodType,
  fn: (input, ctx: AuthedCtx) => Promise<Result<TOut>>
): (_prev: Result<TOut>|null, formData: FormData) => Promise<Result<TOut>>
```

### `src/lib/cache/tags.ts`
```ts
invoiceTags.list(orgId): string      // "org:{orgId}:invoices"
invoiceTags.record(orgId, id): string // "org:{orgId}:invoice:{id}"
invoiceTags.summary(orgId): string   // "org:{orgId}:summary"
```

### `src/lib/cache/profiles.ts`
```ts
cacheProfiles: Record<string, { profile: string }>
// listInvoices → 'minutes', getInvoiceDetail → 'minutes', getOrgInvoiceSummary → 'hours'
```

### `src/lib/cache/log.ts`
```ts
logCacheInvalidation(tag: string, source: 'action'|'job'): void
```

### `src/lib/invoices/search-params.ts`
```ts
invoiceListSearchParams          // nuqs parsers: status(enum|null), sort(enum, default '-createdAt'), q(string, default ''), view(enum, default 'active'), cursor(string|null)
invoiceListSearchParamsCache     // nuqs server-side cache instance
```

### `src/lib/invoices/scoped-query.ts`
```ts
activeFilter(inv: Invoice): boolean
archivedFilter(inv: Invoice): boolean
type InvoiceQuery = { filter, sort, cursorAfter, take, hasPrev, hasMoreThan, find }
scopedInvoices(orgId: string): { active(): InvoiceQuery; archived(): InvoiceQuery; includingDeleted(): InvoiceQuery }
```

### `src/lib/invoices/queries.ts`
```ts
type InvoiceSort = '-createdAt'|'createdAt'|'-total'|'total'|'-customer'|'customer'
type InvoiceView = 'active'|'archived'|'all'
type ListParsed = { status: InvoiceStatus|null; sort: InvoiceSort; view: InvoiceView; q: string; cursor: string|null }
type ListInvoicesArgs = { orgId, view, status, sort, q, cursor, role, pageSize? }
type ListInvoicesResult = { rows: Invoice[]; nextCursor: string|null; hasPrev: boolean }

// All three are 'use cache' Server Functions:
listInvoices(args: ListInvoicesArgs): Promise<ListInvoicesResult & { fetchedAt: string }>
  // cacheLife('minutes'); cacheTag(invoiceTags.list(orgId))

getOrgInvoiceSummary(orgId: string): Promise<{ totalCount, totalAmount, updatedAt, fetchedAt }>
  // cacheLife('hours'); cacheTag(invoiceTags.summary(orgId)); falls back to live compute if no summary row

getInvoiceDetail(args: { orgId, id, role }): Promise<(Invoice & { fetchedAt: string }) | null>
  // cacheLife('minutes'); cacheTag(invoiceTags.record(orgId,id), invoiceTags.list(orgId))
```

### `src/lib/invoices/actions.ts`
All are Server Actions returning `Result<Invoice>`. FormData schemas validated via `authedAction`.
```ts
updateInvoice  // min role: 'member'; schema: {id,customerName,status,total,version,overwrite}
               // version precondition; overwrite=true admin-only bypass
               // on commit: updateTag list+record+summary (or revalidateTag if misuseFlag on)
               // + logCacheInvalidation each tag; + revalidatePath('/invoices')

archiveInvoice  // min role: 'member'; schema: {id,version}; sets archivedAt
restoreInvoice  // min role: 'member'; schema: {id,version}; clears archivedAt+deletedAt
softDeleteInvoice // min role: 'admin'; schema: {id,version}; sets deletedAt
// archive/restore/softDelete all call invalidateInvoice(orgId,id): updateTag list+record+summary + log
```

### `src/server/jobs/summary-recompute.ts`
```ts
recomputeOrgSummary(input: { orgId: string }): Promise<{ orgId, totalCount, totalAmount }>
// Zod-validates input; recomputes active rows; upserts summary;
// revalidateTag(summaryTag, 'max') — NOT updateTag (job context, no waiting user)
// logCacheInvalidation(summaryTag, 'job')
```

### `src/app/inspector/actions.ts`
```ts
resetAndReseed(): Promise<void>                    // calls reseed(); revalidatePath x2
switchIdentity(formData: FormData): Promise<void>  // writes identity cookie; revalidatePath x2
forceVersionDrift(formData: FormData): Promise<void> // bumps row.version by 1; revalidatePath x2
```

### `src/app/inspector/cache-actions.ts`
```ts
editOneInvoice(): Promise<void>      // runs updateInvoice on inv-0001; redirect /inspector?result=…
archiveOneInvoice(): Promise<void>
restoreOneInvoice(): Promise<void>
deleteOneInvoice(): Promise<void>
runSummaryJob(): Promise<void>       // calls recomputeOrgSummary for session.orgId
toggleMisuseRevalidate(): Promise<void>  // flips misuseFlag; redirect /inspector
```

### `src/app/inspector/force-updatetag/route.ts`
```ts
GET/POST handler: calls updateTag() inside try/catch; returns JSON { ok, message }
// updateTag always throws in a Route Handler context — message captures the framework error
```

### `src/app/_components/submit-button.tsx`
```ts
SubmitButton: ComponentProps<typeof Button> & { pendingLabel?: string }
// reads useFormStatus().pending; disables + shows pendingLabel while pending
```

### `src/app/(app)/invoices/fetched-at-strip.tsx`
```ts
FetchedAtStrip({ listFetchedAt?, summaryFetchedAt?, detailFetchedAt? })
// renders <time> per provided timestamp; stable = cache hit, advancing = miss
```

### `src/app/(app)/invoices/table.tsx`
```ts
InvoicesTable({ rows: Invoice[]; view: InvoiceView; role: Role })
// useOptimistic for archive removal; useActionState for lifecycle dispatchers; useResultToast for toasts
```

### `src/app/(app)/invoices/[id]/edit/edit-form.tsx`
```ts
EditForm({ invoice: Invoice; role: Role })
// uncontrolled inputs keyed on seed.version; conflict → ConflictBanner; onUseLatest swaps seed to server's current
```

### `src/app/(app)/invoices/[id]/edit/conflict-banner.tsx`
```ts
ConflictBanner({ current: Invoice; onUseLatest: ()=>void; onOverwrite: ()=>void; canOverwrite: boolean })
```

## Dependencies

**Runtime:**
| Package | Version |
|---|---|
| next | 16.2.7 |
| react | 19.2.4 |
| react-dom | 19.2.4 |
| nuqs | ^2.8.9 |
| next-themes | ^0.4.6 |
| zod | ^4.4.3 |
| radix-ui | ^1.4.3 |
| class-variance-authority | ^0.7.1 |
| clsx | ^2.1.1 |
| tailwind-merge | ^3.6.0 |
| lucide-react | ^1.17.0 |
| sonner | ^2.0.7 |
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
| @types/node | ^25.9.1 |
| @types/react | ^19.2.16 |

## Start diff

The file tree is identical between `start/` and `solution/`. All differences are in source file contents.

### Files that differ

**`src/lib/cache/tags.ts`**
Start: `invoiceTags.list/record/summary` all return `''` (empty string stubs).
Solution: return real tag strings `"org:{orgId}:invoices"`, `"org:{orgId}:invoice:{id}"`, `"org:{orgId}:summary"`.

**`src/lib/cache/profiles.ts`**
Start: `cacheProfiles` is an empty object `{}`.
Solution: populated with `listInvoices → 'minutes'`, `getInvoiceDetail → 'minutes'`, `getOrgInvoiceSummary → 'hours'`.

**`src/lib/invoices/queries.ts`**
Start: the three async functions (`listInvoices`, `getOrgInvoiceSummary`, `getInvoiceDetail`) have no `'use cache'`, no `cacheLife`, no `cacheTag` directives.
Solution: all three have `'use cache'` + `cacheLife` + `cacheTag`.

**`src/lib/invoices/actions.ts`**
Start: `updateInvoice`, `archive`, `restore`, `softDelete` call only `revalidatePath('/invoices')` after commit — no `updateTag`, no `logCacheInvalidation`, no misuse branch.
Solution: adds `invalidateInvoice()` helper (calls `updateTag` + `logCacheInvalidation` for list+record+summary tags) to `archive`, `restore`, `softDelete`; adds misuse branch to `updateInvoice` (reads `misuseFlag` to route list tag through `revalidateTag` instead of `updateTag`); also imports `logCacheInvalidation` and `invoiceTags`.

**`src/server/jobs/summary-recompute.ts`**
Start: `recomputeOrgSummary` throws `new Error('summary job not implemented')`.
Solution: full implementation — Zod-validates input, recomputes active rows, upserts summary row, calls `revalidateTag(summaryTag, 'max')`, calls `logCacheInvalidation(summaryTag, 'job')`, returns result object.

### TODO comments in start/

All TODOs appear in the files listed above; all are resolved in solution.

| File | TODO |
|---|---|
| `src/lib/cache/tags.ts` | `TODO(L2)` — implement `invoiceTags.list/record/summary` returning scoped tag strings |
| `src/lib/cache/profiles.ts` | `TODO(L2)` — map `listInvoices`/`getInvoiceDetail` → `'minutes'`, `getOrgInvoiceSummary` → `'hours'` |
| `src/lib/invoices/queries.ts` (×3) | `TODO(L2)` — add `'use cache'` + `cacheLife` + `cacheTag` to each of the three cached reads |
| `src/lib/invoices/actions.ts` (×4) | `TODO(L3)` — after commit: `updateTag` list+record+summary, `logCacheInvalidation(tag,'action')` for `updateInvoice`, `archive`, `restore`, `softDelete`; also misuse branch in `updateInvoice` |
| `src/server/jobs/summary-recompute.ts` | `TODO(L4)` — Zod-validate `orgId`; recompute; upsert summary; `revalidateTag(summary,'max')`; log `'job'` |

No files outside these five differ between `start/` and `solution/`.
