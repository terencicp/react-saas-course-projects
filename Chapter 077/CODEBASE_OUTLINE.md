# Chapter 077 — Codebase Summary

## Solution file tree

```
src/
  app/
    layout.tsx                          Root layout: wraps tree in <Providers> + NuqsAdapter + Toaster
    page.tsx                            Root redirect → /invoices
    globals.css                         Tailwind v4 base styles
    _components/
      providers.tsx                     QueryClientProvider + gated ReactQueryDevtools + ClearCacheOnFlag
      submit-button.tsx                 useFormStatus-driven submit button
    api/
      invoices/[id]/comments/
        route.ts                        GET /api/invoices/[id]/comments — authed route handler (read seam)
    inspector/
      page.tsx                          Inspector page: row counts, identity switcher, comment controls, audit tail
      actions.ts                        Server Actions: resetAndReseed, switchIdentity, forceVersionDrift,
                                        armForceFailureAction, insertCoworkerCommentAction, clearClientCacheAction
      loading.tsx                       Skeleton loading UI for inspector
    (app)/invoices/
      page.tsx                          Invoice list page: nuqs parse → listInvoices → table + toolbar + pagination
      table.tsx                         InvoicesTable: optimistic archive, per-row lifecycle actions via useActionState
      toolbar.tsx                       Status + sort selects + debounced search input via nuqs
      view-tabs.tsx                     Active / Archived / All tab switcher (All hidden from non-admins)
      active-filter-chips.tsx           Active filter summary chips (status, q, sort)
      clear-chip.tsx                    Single chip clear button (nuqs setQueryStates)
      pagination.tsx                    First page / Next cursor buttons via nuqs
      loading.tsx                       Skeleton loading UI for invoice list
      [id]/
        page.tsx                        Invoice detail page: prefetchInfiniteQuery + HydrationBoundary + CommentThread
        comment-thread.tsx              Client component: useInfiniteQuery + useMutation with optimistic add
        comment-form.tsx                Controlled textarea + submit; props-driven from CommentThread
        edit/
          page.tsx                      Edit invoice page: load row → render EditForm
          edit-form.tsx                 useActionState(updateInvoice) + conflict banner + overwrite flow
          conflict-banner.tsx           Shows server's current row on 409; "Use latest" / "Overwrite anyway" buttons
          loading.tsx                   Skeleton loading UI for edit page
  components/ui/                        Shadcn/ui components (button, input, label, select, card, badge,
                                        dropdown-menu, separator, skeleton, sonner, dialog)
  lib/
    utils.ts                            cn() — clsx + tailwind-merge
    result.ts                           Result<T> type + ok() / err() / conflict() helpers
    tags.ts                             Cache-tag builders: invoiceTag, orgInvoicesTag, invoiceCommentsTag
    authed-action.ts                    authedAction() (FormData) + authedInputAction() (plain object) factories
    authed-route.ts                     authedRoute() route handler factory; returns Problem Details on refusal
    query-client.ts                     makeQueryClient() + getQueryClient() (server: cache(), browser: singleton)
    comments/
      schema.ts                         Zod schemas: commentSchema, commentsPageSchema, addCommentInput,
                                        commentsQuerySchema + derived types
      keys.ts                           commentKeys factory: .all / .lists(invoiceId) / .detail(id)
      fetcher.ts                        fetchCommentsPage() — client-safe HTTP fetcher for the route handler
      queries.ts                        listCommentsPage() — server-only wrapper projecting orgId off store rows
      actions.ts                        addCommentAction — authedInputAction write seam with force-failure check
      force-failure.ts                  Per-user one-shot force-500 flag backed by globalThis map
    invoices/
      search-params.ts                  nuqs invoiceListSearchParams + invoiceListSearchParamsCache
      queries.ts                        listInvoices() + getInvoiceDetail() — server-only reads via scopedInvoices
      actions.ts                        updateInvoice, archiveInvoice, restoreInvoice, softDeleteInvoice actions
      scoped-query.ts                   scopedInvoices(orgId) builder: active() / archived() / includingDeleted();
                                        activeFilter / archivedFilter predicates; InvoiceQuery fluent type
  server/
    types.ts                            InvoiceStatus, Role, roleAtLeast(), Invoice, AuditLog, InvoiceComment types
    session.ts                          getSession() / setActingIdentity() — cookie-driven dev session
    store.ts                            globalThis-backed in-memory store: invoices, auditLogs, invoiceComments;
                                        reseed(), findInvoice(), findUser(), pushAudit(), pushComment(),
                                        insertCoworkerComment(), listCommentsPage(); StoreUser, ListCommentsPageArgs
next.config.ts                          Next.js config (cacheComponents, typedRoutes, reactCompiler, turbopack)
biome.json                              Biome linter/formatter config
vitest.config.ts                        Vitest config
tsconfig.json                           TypeScript config with @/* path alias
```

## Contracts

### `src/lib/query-client.ts`
```ts
export const makeQueryClient = (): QueryClient  // staleTime:60s, gcTime:5min, dehydrate pending queries
export const getQueryClient = (): QueryClient   // server: cache(makeQueryClient)(), browser: module singleton
```

### `src/lib/result.ts`
```ts
export type ErrorCode = 'validation' | 'conflict' | 'not_found' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'internal'
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; userMessage: string; fieldErrors?: Record<string,string[]>; current?: unknown } }
export const ok = <T>(data: T): Result<T>
export const err = (code: ErrorCode, userMessage: string, fieldErrors?: Record<string,string[]>): Result<never>
export const conflict = <T>(userMessage: string, current: T): Result<never>
```

### `src/lib/tags.ts`
```ts
export const invoiceTag = (id: string): string           // "invoice:<id>"
export const orgInvoicesTag = (orgId: string): string    // "org-invoices:<orgId>"
export const invoiceCommentsTag = (invoiceId: string): string  // "invoice-comments:<invoiceId>"
```

### `src/lib/authed-action.ts`
```ts
export type AuthedCtx = { session: Session; orgId: string; userId: string; role: Role }
export const authedAction = <TSchema, TOut>(role: Role, schema: TSchema, fn: (input, ctx: AuthedCtx) => Promise<Result<TOut>>) => (_prev, formData: FormData) => Promise<Result<TOut>>
export const authedInputAction = <TSchema, TOut>(role: Role, schema: TSchema, fn: (input, ctx: AuthedCtx) => Promise<Result<TOut>>) => (input: z.infer<TSchema>) => Promise<Result<TOut>>
```

### `src/lib/authed-route.ts`
```ts
export type RouteCtx = { session: Session; orgId: string; userId: string; role: Role; params: { id: string } }
export const authedRoute = <TSchema>(role: Role, schema: TSchema, fn: (query, ctx: RouteCtx) => Promise<Response> | Response) => (request: NextRequest, context: RouteContext) => Promise<Response>
// Refusals: 401/403/400/500 Problem Details JSON (RFC 9457)
```

### `src/lib/comments/schema.ts`
```ts
export const commentSchema          // { id, invoiceId, authorId, authorName, body, createdAt } — z.string().min(1) ids (not z.uuid())
export const commentsPageSchema     // { comments: Comment[], nextCursor: string|null, prevCursor: string|null }
export const addCommentInput        // { invoiceId: string.min(1), body: string.min(1).max(2000) }
export const commentsQuerySchema    // { cursor: string.nullable().optional() }
export type Comment, CommentsPage, AddCommentInput
```

### `src/lib/comments/keys.ts`
```ts
export const commentKeys = {
  all: ['comments'],
  lists: (invoiceId: string) => ['comments', 'list', invoiceId],
  detail: (id: string) => ['comments', 'detail', id],
}
```

### `src/lib/comments/fetcher.ts`
```ts
export type FetchCommentsArgs = { invoiceId: string; cursor: string | null }
export const fetchCommentsPage = (args: FetchCommentsArgs): Promise<CommentsPage>
// Hits GET /api/invoices/<invoiceId>/comments?cursor=<cursor>; parses commentsPageSchema
```

### `src/lib/comments/queries.ts` (server-only)
```ts
export const listCommentsPage = (args: ListCommentsPageArgs): CommentsPage
// Projects orgId off store rows before returning (strictObject compliance)
```

### `src/lib/comments/actions.ts` (`'use server'`)
```ts
export const addCommentAction: (input: AddCommentInput) => Promise<Result<{ id: string; createdAt: string }>>
// authedInputAction('member', addCommentInput, ...); consumes force-failure, pushComment+pushAudit, updateTag(invoiceCommentsTag)
```

### `src/lib/comments/force-failure.ts` (server-only)
```ts
export const armForceFailure = (userId: string): void
export const consumeForceFailure = (userId: string): boolean  // read-and-clear
export const isForceFailureArmed = (userId: string): boolean
// Backed by globalThis.__forceFailNextPost: Map<string, true>
```

### `src/lib/invoices/search-params.ts`
```ts
export const invoiceListSearchParams  // nuqs parsers: status, sort, q, view, cursor
export const invoiceListSearchParamsCache  // createSearchParamsCache(invoiceListSearchParams)
```

### `src/lib/invoices/queries.ts` (server-only)
```ts
export type InvoiceSort = '-createdAt' | 'createdAt' | '-total' | 'total' | '-customer' | 'customer'
export type InvoiceView = 'active' | 'archived' | 'all'
export type ListParsed = { status: InvoiceStatus|null; sort: InvoiceSort; view: InvoiceView; q: string; cursor: string|null }
export type ListInvoicesArgs = { orgId, view, status, sort, q, cursor, role, pageSize? }
export type ListInvoicesResult = { rows: Invoice[]; nextCursor: string|null; hasPrev: boolean }
export const listInvoices = (args: ListInvoicesArgs): ListInvoicesResult
export type GetInvoiceDetailArgs = { orgId, id, role }
export const getInvoiceDetail = (args: GetInvoiceDetailArgs): Invoice | null
```

### `src/lib/invoices/actions.ts` (`'use server'`)
```ts
export const updateInvoice: authedAction('member', updateInvoiceSchema, ...)    // { id, customerName, status, total, version, overwrite? } → Result<Invoice>
export const archiveInvoice: authedAction('member', lifecycle, ...)             // { id, version } → Result<Invoice>
export const restoreInvoice: authedAction('member', lifecycle, ...)             // { id, version } → Result<Invoice>
export const softDeleteInvoice: authedAction('admin', lifecycle, ...)           // { id, version } → Result<Invoice>
```

### `src/lib/invoices/scoped-query.ts` (server-only)
```ts
export const activeFilter: (inv: Invoice) => boolean
export const archivedFilter: (inv: Invoice) => boolean
export type InvoiceQuery = { filter, sort, cursorAfter, take, hasPrev, hasMoreThan, find }
export const scopedInvoices = (orgId: string) => { active(): InvoiceQuery; archived(): InvoiceQuery; includingDeleted(): InvoiceQuery }
```

### `src/server/types.ts`
```ts
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'
export type Role = 'owner' | 'admin' | 'member'
export const roleAtLeast = (role: Role, required: Role): boolean
export type Invoice = { id, orgId, number, customerName, status, total, currency, createdAt, dueAt, deletedAt, archivedAt, version }
export type AuditLog = { id, orgId, actorUserId, action, subjectId, createdAt }
export type InvoiceComment = { id, orgId, invoiceId, authorId, authorName, body, createdAt }
```

### `src/server/session.ts` (server-only)
```ts
export type Session = { userId: string; orgId: string; role: Role }
export const getSession = (): Promise<Session>          // reads 'acting-identity' cookie; defaults to org-acme:admin
export const setActingIdentity = (value: string): Promise<void>  // 'use server' — writes cookie
```

### `src/server/store.ts` (server-only)
```ts
// globalThis-backed singleton arrays (survives bundle split):
export const invoices: Invoice[]
export const auditLogs: AuditLog[]
export const invoiceComments: InvoiceComment[]
export const users: StoreUser[]   // 4 seeded users: 2 orgs × (admin + member)
export type StoreUser = { id, orgId, role, name }
export const reseed = (): void
export const findInvoice = (orgId, id): Invoice | undefined
export const findUser = (id): StoreUser | undefined
export const pushAudit = (entry: Omit<AuditLog, 'id'|'createdAt'>): void
export const pushComment = (entry: Omit<InvoiceComment, 'id'|'createdAt'>): InvoiceComment
export const insertCoworkerComment = (orgId, invoiceId): InvoiceComment | undefined
export type ListCommentsPageArgs = { orgId, invoiceId, cursor: string|null, pageSize }
export type CommentsStorePage = { comments: InvoiceComment[]; nextCursor: string|null; prevCursor: string|null }
export const listCommentsPage = (args: ListCommentsPageArgs): CommentsStorePage
// Cursor encoding: base64url of "createdAt|id"; ordering: createdAt desc, id desc
// Seed: 45 org-acme invoices + 1 archived + 1 deleted + 6 org-globex; 240 comments on focal invoice per org
```

### `src/app/api/invoices/[id]/comments/route.ts`
```ts
export const GET = authedRoute('member', commentsQuerySchema, (query, ctx) => Response.json({ data: commentsPageSchema.parse(page) }))
// pageSize: 20; tenancy via ctx.orgId; cross-org invoiceId yields empty page
```

### `src/app/(app)/invoices/[id]/page.tsx`
```ts
// Server Component: prefetchInfiniteQuery(commentKeys.lists(id), listCommentsPage, pageSize:20)
// Wraps <CommentThread> in <HydrationBoundary state={dehydrate(queryClient)}>
```

### `src/app/(app)/invoices/[id]/comment-thread.tsx`
```ts
export type Session = { userId: string; userName: string }
export const CommentThread = ({ invoiceId, session }: { invoiceId: string; session: Session }) => JSX.Element
// useInfiniteQuery: queryKey=commentKeys.lists(invoiceId), queryFn=fetchCommentsPage,
//   refetchInterval:10_000, refetchIntervalInBackground:false, maxPages:10
// useMutation: cancelQueries → snapshot → setQueryData page-0 prepend (optimistic: Comment with id "optimistic-<uuid>")
//   → onError restore snapshot → onSuccess clearBody → onSettled invalidateQueries
// data-testid: poll-indicator, comment-thread, comment-row (data-comment-id), load-older, thread-error
```

### `src/app/(app)/invoices/[id]/comment-form.tsx`
```ts
export const CommentForm = ({ body, onBodyChange, onPost, isPending, error }: {
  body: string; onBodyChange: (body: string) => void; onPost: (body: string) => void;
  isPending: boolean; error: string | null
}) => JSX.Element
// data-testid: post-error, comment-submit
```

### `src/app/(app)/invoices/[id]/edit/edit-form.tsx`
```ts
export const EditForm = ({ invoice: Invoice, role: Role }) => JSX.Element
// useActionState(updateInvoice); seed+conflictRow state; "Use latest" / "Overwrite anyway" handlers
// data-testid: edit-form, version-input, conflict-banner (via ConflictBanner)
```

### `src/app/(app)/invoices/[id]/edit/conflict-banner.tsx`
```ts
export const ConflictBanner = ({ current: Invoice, onUseLatest, onOverwrite, canOverwrite }) => JSX.Element
// data-testid: conflict-banner, conflict-current-total, conflict-use-latest, conflict-overwrite
```

### `src/app/_components/providers.tsx`
```ts
export const Providers = ({ children: ReactNode }) => JSX.Element
// QueryClientProvider(getQueryClient()); dynamic ReactQueryDevtools (prod-gated);
// ClearCacheOnFlag reads ?clearCache=1 and calls queryClient.clear()
```

### `src/app/inspector/actions.ts` (`'use server'`)
```ts
export const resetAndReseed: () => Promise<void>
export const switchIdentity: (formData: FormData) => Promise<void>
export const forceVersionDrift: (formData: FormData) => Promise<void>
export const armForceFailureAction: () => Promise<void>
export const insertCoworkerCommentAction: (formData: FormData) => Promise<void>
export const clearClientCacheAction: (formData: FormData) => Promise<void>  // redirect with ?clearCache=1
```

### `src/lib/utils.ts`
```ts
export const cn = (...inputs: ClassValue[]): string  // clsx + twMerge
```

### `next.config.ts`
```ts
{ cacheComponents: true, typedRoutes: true, reactCompiler: true, turbopack: { root: __dirname }, devIndicators: false }
```

## Dependencies

**Runtime**
| Package | Version |
|---|---|
| next | 16.2.7 |
| react | 19.2.4 |
| react-dom | 19.2.4 |
| @tanstack/react-query | ^5.101.0 |
| @tanstack/react-query-devtools | ^5.101.0 |
| zod | ^4.4.3 |
| nuqs | ^2.8.9 |
| next-themes | ^0.4.6 |
| sonner | ^2.0.7 |
| radix-ui | ^1.4.3 |
| lucide-react | ^1.17.0 |
| class-variance-authority | ^0.7.1 |
| clsx | ^2.1.1 |
| tailwind-merge | ^3.6.0 |
| tw-animate-css | ^1.4.0 |
| uuidv7 | ^1.0.2 |

**Dev**
| Package | Version |
|---|---|
| typescript | ^6.0.3 |
| @biomejs/biome | 2.4.16 |
| tailwindcss | ^4.3.0 |
| vitest | ^4.1.8 |
| babel-plugin-react-compiler | 1.0.0 |
| @types/react | ^19.2.16 |
| @types/node | ^25.9.1 |
| vite-tsconfig-paths | ^5.1.4 |

## Start diff

The start and solution share the same file tree. No files are added or removed. The differences are all within existing files.

**Files identical between start and solution** (no TODOs, no diff): all `src/components/ui/*`, `src/server/types.ts`, `src/lib/result.ts`, `src/lib/tags.ts`, `src/lib/authed-action.ts`, `src/lib/authed-route.ts`, `src/lib/comments/schema.ts`, `src/lib/comments/force-failure.ts`, `src/lib/comments/queries.ts`, `src/lib/invoices/search-params.ts`, `src/lib/invoices/queries.ts`, `src/lib/invoices/actions.ts`, `src/lib/invoices/scoped-query.ts`, `src/server/session.ts`, `src/server/store.ts`, `src/app/inspector/page.tsx`, `src/app/inspector/actions.ts`, `src/app/(app)/invoices/page.tsx`, `src/app/(app)/invoices/table.tsx`, `src/app/(app)/invoices/toolbar.tsx`, `src/app/(app)/invoices/view-tabs.tsx`, `src/app/(app)/invoices/active-filter-chips.tsx`, `src/app/(app)/invoices/clear-chip.tsx`, `src/app/(app)/invoices/pagination.tsx`, `src/app/(app)/invoices/[id]/edit/page.tsx`, `src/app/(app)/invoices/[id]/edit/edit-form.tsx`, `src/app/(app)/invoices/[id]/edit/conflict-banner.tsx`, `src/lib/utils.ts`, `src/app/page.tsx`, `src/app/_components/submit-button.tsx`, `next.config.ts`, loading skeletons.

**Files with TODOs (student work)**:

`src/lib/query-client.ts` — `TODO(L2)`: start exports a trivial `new QueryClient()` with no config. Solution adds `makeQueryClient()` with default options (staleTime, gcTime, dehydrate pending) and `getQueryClient()` with the `typeof window` / `cache()` branch.

`src/lib/comments/keys.ts` — `TODO(L2)`: start is an empty comment stub. Solution implements the full `commentKeys` factory.

`src/lib/comments/fetcher.ts` — `TODO(L2/L3)`: start throws `'TODO(L3) — client fetcher not wired yet'`. Solution builds the URL, fetches, and parses `commentsPageSchema`.

`src/app/_components/providers.tsx` — `TODO(L2)`: start is `ThemeProvider` only wrapping children. Solution adds `QueryClientProvider`, dynamic `ReactQueryDevtools`, and the `ClearCacheOnFlag` child inside `<Suspense>`.

`src/app/layout.tsx` — `TODO(L2)` marker only (layout body is identical); start comment says "wrap children in Providers" but the `<Providers>` tag is already present — this TODO is documentation-only, no code diff.

`src/app/api/invoices/[id]/comments/route.ts` — `TODO(L3)`: start returns a static empty response. Solution wires `authedRoute`.

`src/lib/comments/actions.ts` — `TODO(L4)`: start stub returns `{ ok: false, error: { code: 'internal', userMessage: 'Not implemented' } }`. Solution implements the full write seam with force-failure, pushComment, pushAudit, and updateTag.

`src/app/(app)/invoices/[id]/page.tsx` — `TODO(L2)`: start renders `<CommentThread>` with no hydration. Solution adds `getQueryClient()`, `prefetchInfiniteQuery`, and wraps the thread in `<HydrationBoundary>`.

`src/app/(app)/invoices/[id]/comment-thread.tsx` — `TODO(L2/L3/L4)`: start is a static stub showing "Thread not wired yet" and an un-wired `<CommentForm />` with no props. Solution adds `useInfiniteQuery` + `useMutation` with full optimistic flow, poll indicator, error display, and "Load older" button.

`src/app/(app)/invoices/[id]/comment-form.tsx` — `TODO(L4)`: start is a static disabled form with no props. Solution is a fully controlled form with `body`/`onBodyChange`/`onPost`/`isPending`/`error` props.

**TODO markers by lesson**:
- L2: `query-client.ts`, `comments/keys.ts`, `comments/fetcher.ts` (in-process branch), `providers.tsx`, `layout.tsx` (doc-only), `invoices/[id]/page.tsx`, `comment-thread.tsx` (minimal read)
- L3: `comments/fetcher.ts` (client branch), `api/.../route.ts`, `comment-thread.tsx` (real read shape)
- L4: `comments/actions.ts`, `comment-thread.tsx` (mutation), `comment-form.tsx`
