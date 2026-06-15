# Chapter 062 — Codebase Summary

## Solution file tree

```
solution/
├── package.json                                          — project manifest (name: chapter-062-production-list-view)
├── scripts/
│   └── test-lesson.mjs                                   — CLI shim: runs vitest for a single lesson file
├── lesson-verification/
│   ├── Lesson 2.ts                                       — placeholder test (describe.todo)
│   ├── Lesson 3.ts                                       — placeholder test (describe.todo)
│   ├── Lesson 4.ts                                       — placeholder test (describe.todo)
│   └── Lesson 5.ts                                       — placeholder test (describe.todo)
└── src/
    ├── app/
    │   ├── globals.css                                   — Tailwind base styles
    │   ├── layout.tsx                                    — root layout: NuqsAdapter + ThemeProvider + nav
    │   ├── page.tsx                                      — root redirect to /invoices
    │   ├── _components/
    │   │   ├── providers.tsx                             — ThemeProvider wrapper
    │   │   └── submit-button.tsx                         — Button that reads useFormStatus pending state
    │   ├── (app)/invoices/
    │   │   ├── page.tsx                                  — RSC: parses searchParams, calls listInvoices, renders layout
    │   │   ├── loading.tsx                               — Skeleton loading UI for the list
    │   │   ├── toolbar.tsx                               — client: status/sort/search selects via useQueryStates
    │   │   ├── view-tabs.tsx                             — client: Active/Archived/All tabs via useQueryStates
    │   │   ├── active-filter-chips.tsx                   — RSC: chips for active status/sort/search filters
    │   │   ├── clear-chip.tsx                            — client: "x" button that clears a single filter param
    │   │   ├── pagination.tsx                            — client: Next/First page buttons via useQueryState
    │   │   ├── table.tsx                                 — client: invoice rows + lifecycle badges + row actions + optimistic archive
    │   │   └── [id]/edit/
    │   │       ├── page.tsx                              — RSC: loads invoice via getInvoiceDetail, renders EditForm
    │   │       ├── loading.tsx                           — Skeleton loading UI for the edit form
    │   │       ├── edit-form.tsx                         — client: uncontrolled form with version round-trip + conflict handling
    │   │       └── conflict-banner.tsx                   — client: shows server-current values + Use latest / Overwrite buttons
    │   └── inspector/
    │       ├── page.tsx                                  — RSC: row counts, identity switcher, reseed, force version drift, audit tail
    │       ├── loading.tsx                               — Skeleton loading UI for the inspector
    │       └── actions.ts                                — server actions: resetAndReseed, switchIdentity, forceVersionDrift
    ├── components/ui/                                    — shadcn/ui primitives (badge, button, card, dialog, dropdown-menu, input, label, select, separator, skeleton, sonner)
    ├── lib/
    │   ├── utils.ts                                      — cn() helper (clsx + tailwind-merge)
    │   ├── result.ts                                     — Result<T> discriminated union + ok/err/conflict constructors
    │   ├── authed-action.ts                              — authedAction() higher-order wrapper: session → RBAC → parse → call
    │   └── invoices/
    │       ├── search-params.ts                          — nuqs parser map + createSearchParamsCache for the list URL state
    │       ├── queries.ts                                 — server-only: listInvoices + getInvoiceDetail (sort/filter/cursor/RBAC)
    │       └── scoped-query.ts                           — server-only: scopedInvoices(orgId) fluent query builder
    └── server/
        ├── types.ts                                      — Invoice, InvoiceStatus, Role, AuditLog types + roleAtLeast
        ├── store.ts                                      — in-memory singleton: seeded invoices/auditLogs + findInvoice/pushAudit/reseed
        └── session.ts                                    — cookie-driven dev session: getSession + setActingIdentity
```

## Contracts

### `src/server/types.ts`
```ts
type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'
type Role = 'owner' | 'admin' | 'member'
const ROLE_RANK: Record<Role, number> = { member: 0, admin: 1, owner: 2 }
export const roleAtLeast = (role: Role, required: Role): boolean
type Invoice = {
  id: string; orgId: string; number: string; customerName: string;
  status: InvoiceStatus; total: string; currency: string;
  createdAt: string; dueAt: string | null;
  deletedAt: string | null; archivedAt: string | null; version: number
}
type AuditLog = { id: string; orgId: string; actorUserId: string; action: string; subjectId: string; createdAt: string }
```

### `src/server/store.ts`
```ts
type StoreUser = { id: string; orgId: string; role: Role }
export const users: StoreUser[]          // 4 seeded users (2 orgs × admin+member)
export const invoices: Invoice[]         // mutable; seeded on import
export const auditLogs: AuditLog[]
export const reseed = (): void           // idempotent re-seed (clears + refills arrays)
export const findInvoice = (orgId: string, id: string): Invoice | undefined
export const pushAudit = (entry: Omit<AuditLog, 'id' | 'createdAt'>): void
// Seed: 45 active org-acme rows, 1 pre-archived, 1 pre-soft-deleted, 6 org-globex rows
```

### `src/server/session.ts`
```ts
const COOKIE_NAME = 'acting-identity'
const DEFAULT_IDENTITY = 'org-acme:admin'
type Session = { userId: string; orgId: string; role: Role }
export const getSession = async (): Promise<Session>
export const setActingIdentity = async (value: string): Promise<void>  // 'use server'
```

### `src/lib/result.ts`
```ts
type ErrorCode = 'validation' | 'conflict' | 'not_found' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'internal'
type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; userMessage: string; fieldErrors?: Record<string, string[]>; current?: unknown } }
export const ok = <T>(data: T): Result<T>
export const err = (code: ErrorCode, userMessage: string, fieldErrors?: Record<string, string[]>): Result<never>
export const conflict = <T>(userMessage: string, current: T): Result<never>
```

### `src/lib/authed-action.ts`
```ts
type AuthedCtx = { session: Session; orgId: string; userId: string; role: Role }
export const authedAction = <TSchema extends z.ZodType, TOut>(
  role: Role,
  schema: TSchema,
  fn: (input: z.infer<TSchema>, ctx: AuthedCtx) => Promise<Result<TOut>>,
) => async (_prev: Result<TOut> | null, formData: FormData): Promise<Result<TOut>>
// Pipeline: getSession → roleAtLeast check → schema.safeParse(Object.fromEntries(formData)) → fn
// Any throw becomes err('internal', ...)
```

### `src/lib/invoices/search-params.ts`
```ts
export const invoiceListSearchParams = {
  status: parseAsStringEnum(['draft', 'sent', 'paid', 'overdue']),       // nullable, no default
  sort: parseAsStringEnum(['-createdAt','createdAt','-total','total','-customer','customer']).withDefault('-createdAt'),
  q: parseAsString.withDefault(''),
  view: parseAsStringEnum(['active', 'archived', 'all']).withDefault('active'),
  cursor: parseAsString,   // nullable, no default
}
export const invoiceListSearchParamsCache = createSearchParamsCache(invoiceListSearchParams)
```

### `src/lib/invoices/scoped-query.ts`
```ts
export const activeFilter = (inv: Invoice): boolean    // deletedAt === null && archivedAt === null
export const archivedFilter = (inv: Invoice): boolean  // archivedAt !== null && deletedAt === null
type InvoiceQuery = {
  filter: (predicate: (inv: Invoice) => boolean) => InvoiceQuery
  sort: (compare: (a: Invoice, b: Invoice) => number) => InvoiceQuery
  cursorAfter: (cursor: string | null) => InvoiceQuery
  take: (n: number) => Invoice[]
  hasPrev: () => boolean
  hasMoreThan: (n: number) => boolean
  find: (predicate: (inv: Invoice) => boolean) => Invoice | undefined
}
export const scopedInvoices = (orgId: string) => {
  active: () => InvoiceQuery           // excludes archived + deleted
  archived: () => InvoiceQuery         // archivedAt set, deletedAt null
  includingDeleted: () => InvoiceQuery // all org rows
}
```

### `src/lib/invoices/queries.ts`
```ts
type InvoiceSort = '-createdAt' | 'createdAt' | '-total' | 'total' | '-customer' | 'customer'
type InvoiceView = 'active' | 'archived' | 'all'
type ListParsed = { status: InvoiceStatus | null; sort: InvoiceSort; view: InvoiceView; q: string; cursor: string | null }
type ListInvoicesArgs = { orgId: string; view: InvoiceView; status: InvoiceStatus | null; sort: InvoiceSort; q: string; cursor: string | null; role: Role; pageSize?: number }
type ListInvoicesResult = { rows: Invoice[]; nextCursor: string | null; hasPrev: boolean }
export const listInvoices = (args: ListInvoicesArgs): ListInvoicesResult
// RBAC gate: view='all' collapses to 'active' unless role==='admin'
type GetInvoiceDetailArgs = { orgId: string; id: string; role: Role }
export const getInvoiceDetail = (args: GetInvoiceDetailArgs): Invoice | null
// Loads archived (for restore) + active for everyone; deleted only for admin
```

### `src/lib/invoices/actions.ts`
```ts
// Zod schemas:
// updateInvoiceSchema: { id, customerName, status, total, version (coerced int), overwrite (coerced bool, default false) }
// lifecycle: { id, version (coerced int) }

export const updateInvoice: (_prev, formData) => Promise<Result<Invoice>>
// authedAction('member'): version precondition → conflict on mismatch; overwrite=true is admin-only
export const archiveInvoice: (_prev, formData) => Promise<Result<Invoice>>
// authedAction('member'): version + archivedAt/deletedAt precondition → sets archivedAt
export const restoreInvoice: (_prev, formData) => Promise<Result<Invoice>>
// authedAction('member'): version precondition → clears archivedAt + deletedAt (restores deleted too)
export const softDeleteInvoice: (_prev, formData) => Promise<Result<Invoice>>
// authedAction('admin'): version + deletedAt precondition → sets deletedAt
```

### `src/app/inspector/actions.ts`
```ts
export const resetAndReseed = async (): Promise<void>              // 'use server'; reseed() + revalidate
export const switchIdentity = async (formData: FormData): Promise<void>  // writes acting-identity cookie
export const forceVersionDrift = async (formData: FormData): Promise<void>  // bumps row.version for conflict demo
```

### `src/app/(app)/invoices/page.tsx`
```ts
// RSC, async; props: { searchParams: Promise<SearchParams> }
// Parses URL via invoiceListSearchParamsCache.parse → listInvoices → renders Toolbar, ViewTabs, ActiveFilterChips, InvoicesTable, Pagination
```

### `src/app/(app)/invoices/toolbar.tsx`
```ts
export const Toolbar = ({ parsed }: { parsed: ListParsed }) => JSX.Element
// 'use client'; useQueryStates(invoiceListSearchParams, { shallow: false, limitUrlUpdates: debounce(300) })
// Search input uses useState + useDeferredValue; URL update via useTransition
```

### `src/app/(app)/invoices/view-tabs.tsx`
```ts
export const ViewTabs = ({ parsed, role }: { parsed: ListParsed; role: Role }) => JSX.Element
// 'use client'; 'all' tab only rendered for admin; click writes {view, cursor:null} via useQueryStates
```

### `src/app/(app)/invoices/active-filter-chips.tsx`
```ts
const SORT_LABELS: Record<InvoiceSort, string>
export const ActiveFilterChips = ({ parsed }: { parsed: ListParsed }) => JSX.Element
// RSC; renders chip for status, q, sort (when non-default); each chip contains a ClearChip
```

### `src/app/(app)/invoices/clear-chip.tsx`
```ts
type ClearableParam = 'status' | 'q' | 'sort'
export const ClearChip = ({ param, label }: { param: ClearableParam; label: string }) => JSX.Element
// 'use client'; clears the named param + cursor:null via useQueryStates
```

### `src/app/(app)/invoices/pagination.tsx`
```ts
type PaginationProps = { cursor: string | null; nextCursor: string | null; hasPrev: boolean }
export const Pagination = ({ nextCursor }: PaginationProps) => JSX.Element
// 'use client'; useQueryState('cursor', ...withOptions({ shallow:false }))
// "First page" → setCursor(null); "Next" → setCursor(nextCursor)
```

### `src/app/(app)/invoices/table.tsx`
```ts
export const InvoicesTable = ({ rows, view, role }: { rows: Invoice[]; view: InvoiceView; role: Role }) => JSX.Element
// 'use client'
// useOptimistic(rows, (current, removedId) => current.filter(r => r.id !== removedId))
// useActionState for archiveInvoice, restoreInvoice, softDeleteInvoice
// useResultToast: fires sonner toast on each settled Result
// onArchive: wraps archiveOptimistic + archiveDispatch in shared useTransition
// Row actions gated: archive (isActive), restore (archivedAt && !deletedAt), undelete (deletedAt && admin), delete (isActive && admin)
```

### `src/app/(app)/invoices/[id]/edit/edit-form.tsx`
```ts
export const EditForm = ({ invoice, role }: { invoice: Invoice; role: Role }) => JSX.Element
// 'use client'; useActionState(updateInvoice, null)
// seed state: updated on ok to prevent self-conflict; swapped to conflictRow on Use latest
// formRef used for Overwrite: builds FormData manually with overwrite=true
// ConflictBanner rendered when conflictRow !== null; canOverwrite = roleAtLeast(role, 'admin')
```

### `src/app/(app)/invoices/[id]/edit/conflict-banner.tsx`
```ts
export const ConflictBanner = ({
  current: Invoice,
  onUseLatest: () => void,
  onOverwrite: () => void,
  canOverwrite: boolean,
}) => JSX.Element
// Shows current.customerName/status/total; "Use latest" button always; "Overwrite anyway" only when canOverwrite
```

### `src/app/_components/submit-button.tsx`
```ts
export const SubmitButton = (props: ComponentProps<typeof Button> & { pendingLabel?: string }) => JSX.Element
// 'use client'; reads useFormStatus().pending; disables + swaps label while pending
```

### `src/lib/utils.ts`
```ts
export const cn = (...inputs: ClassValue[]) => string   // clsx + twMerge
```

## Dependencies

**Runtime**
| Package | Version |
|---------|---------|
| next | 16.2.7 |
| react | 19.2.4 |
| react-dom | 19.2.4 |
| nuqs | ^2.8.9 |
| zod | ^4.4.3 |
| next-themes | ^0.4.6 |
| radix-ui | ^1.4.3 |
| lucide-react | ^1.17.0 |
| class-variance-authority | ^0.7.1 |
| clsx | ^2.1.1 |
| tailwind-merge | ^3.6.0 |
| sonner | ^2.0.7 |
| uuidv7 | ^1.0.2 |
| tw-animate-css | ^1.4.0 |

**Dev**
| Package | Version |
|---------|---------|
| @biomejs/biome | 2.4.16 |
| typescript | ^6.0.3 |
| tailwindcss | ^4.3.0 |
| @tailwindcss/postcss | ^4.3.0 |
| vitest | ^4.1.8 |
| babel-plugin-react-compiler | 1.0.0 |
| vite-tsconfig-paths | ^5.1.4 |
| @types/node | ^25.9.1 |
| @types/react | ^19.2.16 |
| @types/react-dom | ^19.2.3 |

## Start diff

The `start/` folder contains the same file set as `solution/` **except**:
- `src/app/(app)/invoices/clear-chip.tsx` — **absent** in start (new file students create)
- `lesson-verification/` — **absent** in start (test harness only in solution)

Every other source file exists in both but contains stub implementations in start. The changes students make lesson by lesson:

### Lesson 2 — URL state wiring
**`src/lib/invoices/search-params.ts`**: start exports a no-op `invoiceListSearchParams = {}` and a fake `invoiceListSearchParamsCache` that returns a hard-coded default. Solution replaces with real nuqs parsers for `status`, `sort`, `q`, `view`, `cursor` and `createSearchParamsCache`.

**`src/app/(app)/invoices/toolbar.tsx`**: start uses local `useState` for status/sort/q — changes never reach the URL. Solution replaces with `useQueryStates(invoiceListSearchParams, { shallow: false, limitUrlUpdates: debounce(300) })` and adds deferred-value + transition pattern for the search input.

**`src/app/(app)/invoices/view-tabs.tsx`**: start tab buttons have no onClick handler. Solution adds `useQueryStates` writing `{ view, cursor: null }` on click.

**`src/app/(app)/invoices/active-filter-chips.tsx`**: start returns `null`. Solution renders chips for active status/sort/q using a new `ClearChip` component.

**`src/app/(app)/invoices/clear-chip.tsx`**: new file in solution — `ClearChip` uses `useQueryStates` to clear one param + cursor.

**`src/app/(app)/invoices/pagination.tsx`**: start renders two permanently-disabled buttons. Solution wires `useQueryState('cursor', ...)` — "Next" sets `nextCursor`, "First page" sets `null`.

### Lesson 3 — Lifecycle views and RBAC read gate
**`src/lib/invoices/scoped-query.ts`**: start's `scopedInvoices` returns the same full org list from all three methods (`active`, `archived`, `includingDeleted` are identical). Solution makes them honest: `active()` applies `activeFilter`, `archived()` applies `archivedFilter`, `includingDeleted()` returns everything.

**`src/lib/invoices/queries.ts`** (`listInvoices`): start ignores `view` and `role` (always calls `scopedInvoices(orgId).active()`). Solution adds `resolveView` (collapses `all` → `active` for non-admins) and routes to the matching scoped view.

**`src/lib/invoices/queries.ts`** (`getInvoiceDetail`): start always reads `active()` only and ignores `role`. Solution reads `archived()` first (for restore), then `active()`, then `includingDeleted()` gated to admin.

**`src/app/(app)/invoices/table.tsx`**: start renders rows with no lifecycle badges and only an "Edit" action in the menu. Solution adds `badge-deleted` / `badge-archived` badges and the "Archived on …" date line.

**`src/app/(app)/invoices/view-tabs.tsx`**: start shows all three tabs regardless of role. Solution conditionally renders the "All" tab only for admins.

### Lesson 4 — Lifecycle actions and optimistic archive
**`src/lib/invoices/actions.ts`** (`archive`, `restore`, `softDelete`): all three are `err('internal', 'Not implemented')` stubs in start. Solution implements each with `id`+`version` precondition checks, store mutations, audit pushes, and revalidation.

**`src/app/(app)/invoices/table.tsx`**: start has no action wiring — just the Edit link. Solution lifts `useActionState` for all three lifecycle actions to the table level, adds `useOptimistic` for archive, and wires `onSelect` dispatchers for each menu item.

### Lesson 5 — Optimistic concurrency (version precondition + conflict UI)
**`src/lib/invoices/actions.ts`** (`updateInvoice`): start applies edits unconditionally (ignores `version`). Solution checks `row.version === input.version`, returns `conflict(message, row)` on mismatch, adds `overwrite` field to the schema (admin-only bypass), and re-checks `roleAtLeast` inside the action.

**`src/app/(app)/invoices/[id]/edit/conflict-banner.tsx`**: start component returns `null`. Solution renders the current-row values and "Use latest" / admin "Overwrite anyway" buttons.

**`src/app/(app)/invoices/[id]/edit/edit-form.tsx`**: start has no conflict handling (only updates `seed` on `ok`). Solution adds `conflictRow` state, a `formRef` for manual `FormData` construction, `onUseLatest` (swaps seed to server's current), `onOverwrite` (re-dispatches with `overwrite=true`), and renders `ConflictBanner`.

### TODO comments in start (by file)
- `src/lib/invoices/search-params.ts`: `TODO(L2)` — define the five parsers + searchParamsCache
- `src/lib/invoices/scoped-query.ts`: `TODO(L3)` — make active/archived/includingDeleted honest
- `src/lib/invoices/queries.ts`: `TODO(L3)` ×2 — route on view + gate all to admin (listInvoices + getInvoiceDetail)
- `src/lib/invoices/actions.ts`: `TODO(L5)` — add version precondition + conflict + overwrite; `TODO(L4)` ×3 — implement archive / restore / softDelete
- `src/app/(app)/invoices/toolbar.tsx`: `TODO(L2)` — lift filter/sort/search into URL
- `src/app/(app)/invoices/view-tabs.tsx`: `TODO(L2)` — write view via nuqs setter; `TODO(L3)` — hide all tab for non-admins
- `src/app/(app)/invoices/active-filter-chips.tsx`: `TODO(L2)` — render a chip per non-default filter
- `src/app/(app)/invoices/pagination.tsx`: `TODO(L2)` — wire cursor next/first via useQueryState
- `src/app/(app)/invoices/table.tsx`: `TODO(L3)` — render archived/deleted badges; `TODO(L4)` — wire row actions + optimistic archive
- `src/app/(app)/invoices/[id]/edit/conflict-banner.tsx`: `TODO(L5)` — show current values + Use latest / admin Overwrite
- `src/app/(app)/invoices/[id]/edit/edit-form.tsx`: `TODO(L5)` — render ConflictBanner on the conflict branch
