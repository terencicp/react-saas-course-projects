# Chapter 108 — Codebase Summary

## Solution file tree

```
src/
  env.ts                                        — T3 env: validates AI_GATEWAY_API_KEY
  app/
    layout.tsx                                  — Root layout: NuqsAdapter, ThemeProvider, Toaster, nav
    page.tsx                                    — Root: redirects to /invoices
    globals.css                                 — Tailwind base styles
    _components/
      providers.tsx                             — next-themes ThemeProvider wrapper
      submit-button.tsx                         — Button that reads useFormStatus pending
    (app)/invoices/
      page.tsx                                  — Invoices list page (RSC): parses URL, queries, renders grid + chat rail
      loading.tsx                               — Skeleton loading state for list page
      toolbar.tsx                               — Client: status filter, sort select, debounced search input (nuqs)
      view-tabs.tsx                             — Client: Active / Archived / All tabs (admin-gated "All")
      active-filter-chips.tsx                   — Server: chip row showing active status/search/sort filters
      clear-chip.tsx                            — Client: X button that clears one URL param via nuqs
      table.tsx                                 — Client: invoice table with optimistic archive + lifecycle action menu
      pagination.tsx                            — Client: First page / Next buttons via nuqs cursor param
      invoice-chat.tsx                          — Client: useChat chat panel, renders text parts + InvoiceStatsCard
      invoice-stats-card.tsx                    — Client: four-state tool-part card for getInvoiceStats result
      token-usage-panel.tsx                     — Client: polls /api/usage every 10s, renders progress bar
      [id]/edit/
        page.tsx                                — Edit page RSC: loads invoice via getInvoiceDetail, renders EditForm
        loading.tsx                             — Skeleton loading state for edit page
        edit-form.tsx                           — Client: uncontrolled form with version round-trip, conflict flow
        conflict-banner.tsx                     — Client: displays server's current row on 409, "Use latest" / "Overwrite"
    api/
      chat/route.ts                             — POST streaming chat: withLlmQuota(authedRoute(...)) → streamText
      usage/route.ts                            — GET token usage: authedRoute → readUsage(userId)
    inspector/
      page.tsx                                  — Inspector RSC: row counts, identity switcher, audit tail, LLM panels, flags
      loading.tsx                               — Skeleton loading state for inspector page
      actions.ts                                — Server Actions: resetAndReseed, switchIdentity, forceVersionDrift, forceQuota, toggle flags
  server/
    types.ts                                    — Core domain types: Invoice, AuditLog, Organization, UsageQuotaRow, LlmAuditEvent, Role
    session.ts                                  — Cookie-driven dev session: getSession, setActingIdentity
    store.ts                                    — In-memory singleton "database": all mutable arrays + seed + helpers
    inspector-flags.ts                          — globalThis-backed debug flags: getFlag, setFlag, toggleFlag, allFlags
  lib/
    result.ts                                   — Discriminated Result<T> type + ok/err/conflict constructors
    utils.ts                                    — cn() Tailwind class merger
    authed-action.ts                            — authedAction higher-order wrapper for Server Actions
    authed-route.ts                             — authedRoute higher-order wrapper for Route Handlers
    invoices/
      search-params.ts                          — nuqs search param definitions + cache for invoice list
      queries.ts                                — listInvoices + getInvoiceDetail read functions
      scoped-query.ts                           — scopedInvoices() — the ONLY sanctioned read path into store.invoices
      actions.ts                                — updateInvoice, archiveInvoice, restoreInvoice, softDeleteInvoice server actions
    llm/
      models.ts                                 — chatModel constant (AI Gateway model id)
      quota.ts                                  — DAILY_TOKEN_CAP, readUsage, reserveQuotaOrRefuse, addUsage
      audit.ts                                  — writeLlmStepEvent, writeLlmFinishEvent
      prompts.ts                                — invoiceQAPrompt(ctx) system prompt factory
      tools.ts                                  — buildInvoiceTools(ctx), InvoiceTools, InvoiceUIMessage types
      with-llm-quota.ts                         — withLlmQuota middleware wrapper (reserve-before-spend)
  components/ui/                                — shadcn/radix-ui primitive components (button, badge, card, dialog, dropdown-menu, input, label, select, separator, skeleton, sonner)
```

## Contracts

### `src/env.ts`
- `env` — validated env object; server field: `AI_GATEWAY_API_KEY: string`
- `skipValidation`: true when `NODE_ENV !== 'production'` or `SKIP_ENV_VALIDATION=true`

### `src/lib/result.ts`
```ts
type ErrorCode = 'validation' | 'conflict' | 'not_found' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'internal'
type Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; userMessage: string; fieldErrors?: Record<string, string[]>; current?: unknown } }
ok<T>(data: T): Result<T>
err(code: ErrorCode, userMessage: string, fieldErrors?): Result<never>
conflict<T>(userMessage: string, current: T): Result<never>
```

### `src/lib/utils.ts`
- `cn(...inputs: ClassValue[]): string`

### `src/lib/authed-action.ts`
```ts
type AuthedCtx = { session: Session; orgId: string; userId: string; role: Role }
authedAction<TSchema, TOut>(role: Role, schema: TSchema, fn: (input, ctx: AuthedCtx) => Promise<Result<TOut>>)
  => (_prev: Result<TOut> | null, formData: FormData) => Promise<Result<TOut>>
```
- Resolves session, checks role, parses FormData via schema.safeParse, calls fn. Returns typed Result on all paths, never throws.

### `src/lib/authed-route.ts`
```ts
type RouteCtx = { session: Session; orgId: string; userId: string; role: Role; db: { query: { organization: { findFirst(args): Promise<Organization | undefined> } } } }
authedRoute<TSchema, _TOut>(role: Role, schema: TSchema, fn: (input, ctx: RouteCtx) => Promise<Response>)
  => (req: Request) => Promise<Response>
```
- `BYPASS_AUTHED_ROUTE` inspector flag makes it return 401.
- Status codes: 401 no identity, 403 role, 422 parse, 500 throw.
- GET/empty body treated as `{}`.

### `src/server/types.ts`
```ts
type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'
type Role = 'owner' | 'admin' | 'member'
roleAtLeast(role: Role, required: Role): boolean   // ROLE_RANK: member=0, admin=1, owner=2
type Invoice = { id, orgId, number, customerName, status: InvoiceStatus, total, currency, createdAt, dueAt: string|null, deletedAt: string|null, archivedAt: string|null, version: number }
type AuditLog = { id, orgId, actorUserId, action, subjectId, createdAt }
type Organization = { id, name }
type UsageQuotaRow = { userId, day, tokensUsed: number, updatedAt }
type LlmAuditEvent = { id, userId, orgId, event: 'llm.step'|'llm.finish', payload: Record<string, unknown>, createdAt }
```

### `src/server/session.ts`
```ts
type Session = { userId: string; orgId: string; role: Role }
getSession(): Promise<Session>             // reads 'acting-identity' cookie
setActingIdentity(value: string): Promise<void>   // 'use server'; writes cookie
```
- Default identity: `'org-acme:admin'`; cookie format: `'<orgId>:<role>'`

### `src/server/store.ts`
```ts
type StoreUser = { id: string; orgId: string; role: Role }
users: StoreUser[]          // 4 seeded users (acme-admin, acme-member, globex-admin, globex-member)
organizations: Organization[]   // [org-acme, org-globex]
invoices: Invoice[]             // mutable; seeded with 45 acme + 2 special + 6 globex rows
auditLogs: AuditLog[]
usageQuota: UsageQuotaRow[]     // seeded with user-acme-member near 90k cap
llmAuditEvents: LlmAuditEvent[]

reseed(): void                  // idempotent full reset; called on module init
findInvoice(orgId, id): Invoice | undefined
pushAudit(entry: Omit<AuditLog, 'id'|'createdAt'>): void
todayUtc(): string              // YYYY-MM-DD UTC
findQuotaRow(userId, day): UsageQuotaRow | undefined
pushLlmAuditEvent(entry: Omit<LlmAuditEvent, 'id'|'createdAt'>): void
```

### `src/server/inspector-flags.ts`
```ts
type InspectorFlags = {
  BYPASS_AUTHED_ROUTE: boolean   // makes authedRoute return 401
  MODEL_FROM_INPUT_ORGID: boolean  // makes tool read orgId from model input (exposes cross-tenant leak)
  FORCE_TOOL_ERROR: boolean        // makes getInvoiceStats return { error: 'stats_unavailable' }
}
getFlag(name: keyof InspectorFlags): boolean
setFlag(name: keyof InspectorFlags, value: boolean): void
toggleFlag(name: keyof InspectorFlags): boolean
allFlags(): InspectorFlags
```
- Backed by `globalThis.__inspectorFlags`; all default false.

### `src/lib/invoices/search-params.ts`
```ts
invoiceListSearchParams = {
  status: parseAsStringEnum(['draft','sent','paid','overdue'])         // nullable
  sort: parseAsStringEnum(['-createdAt','createdAt','-total','total','-customer','customer']).withDefault('-createdAt')
  q: parseAsString.withDefault('')
  view: parseAsStringEnum(['active','archived','all']).withDefault('active')
  cursor: parseAsString                                                // nullable
}
invoiceListSearchParamsCache   // nuqs server cache wrapping the above
```

### `src/lib/invoices/scoped-query.ts`
```ts
activeFilter(inv: Invoice): boolean    // deletedAt===null && archivedAt===null
archivedFilter(inv: Invoice): boolean  // archivedAt!==null && deletedAt===null
type InvoiceQuery = {
  filter(predicate): InvoiceQuery
  sort(compare): InvoiceQuery
  cursorAfter(cursor: string|null): InvoiceQuery
  take(n): Invoice[]
  hasPrev(): boolean
  hasMoreThan(n): boolean
  find(predicate): Invoice|undefined
}
scopedInvoices(orgId: string): {
  active(): InvoiceQuery
  archived(): InvoiceQuery
  includingDeleted(): InvoiceQuery
}
```

### `src/lib/invoices/queries.ts`
```ts
type InvoiceSort = '-createdAt'|'createdAt'|'-total'|'total'|'-customer'|'customer'
type InvoiceView = 'active'|'archived'|'all'
type ListParsed = { status: InvoiceStatus|null; sort: InvoiceSort; view: InvoiceView; q: string; cursor: string|null }
type ListInvoicesArgs = { orgId, view, status, sort, q, cursor, role, pageSize?: number }
type ListInvoicesResult = { rows: Invoice[]; nextCursor: string|null; hasPrev: boolean }
listInvoices(args: ListInvoicesArgs): ListInvoicesResult   // view=all collapses to active for non-admin
type GetInvoiceDetailArgs = { orgId, id, role }
getInvoiceDetail(args): Invoice|null   // active+archived for all; deleted only for admin
```

### `src/lib/invoices/actions.ts`
All are `'use server'`, wrapped by `authedAction`.
```ts
updateInvoice   // authedAction('member', updateInvoiceSchema, ...)
  // schema: { id, customerName, status, total, version: coerce.number, overwrite: coerce.boolean.default(false) }
  // conflict on version mismatch; overwrite requires admin
  // returns Result<Invoice>

archiveInvoice  // authedAction('member', lifecycle, ...)   // lifecycle: { id, version }
restoreInvoice  // authedAction('member', lifecycle, ...)
softDeleteInvoice  // authedAction('admin', lifecycle, ...)
```
All lifecycle actions: version precondition check → mutate → pushAudit → revalidatePath('/invoices') → Result<Invoice>.

### `src/lib/llm/models.ts`
- `chatModel = 'openai/gpt-5-mini'`

### `src/lib/llm/quota.ts`
```ts
const DAILY_TOKEN_CAP = 100_000
type UsageReport = { used: number; cap: number; remaining: number }
type QuotaReservation = { ok: true } | { ok: false; error: { code: 'quota_exceeded'; userMessage: string } }
readUsage(userId: string): Promise<UsageReport>
reserveQuotaOrRefuse(userId: string): Promise<QuotaReservation>
addUsage(userId: string, tokens: number): Promise<void>
```

### `src/lib/llm/audit.ts`
```ts
writeLlmStepEvent(args: { userId, orgId, finishReason?, usage?, toolCalls? }): Promise<void>
writeLlmFinishEvent(args: { userId, orgId, finishReason?, usage? }): Promise<void>
```

### `src/lib/llm/prompts.ts`
```ts
invoiceQAPrompt(ctx: { orgName: string }): string
```
Four rules: always call getInvoiceStats for numbers; refuse cross-org questions; graceful on tool error.

### `src/lib/llm/tools.ts`
```ts
buildInvoiceTools(ctx: { orgId: string }): {
  getInvoiceStats: Tool<
    { status?: 'draft'|'sent'|'paid'|'overdue'; since?: ISODate },
    { count: number; totalAmount: number; byStatus: Record<string,number>; oldestUnpaidDueDate: ISODate|null }
  >
}
type InvoiceTools = ReturnType<typeof buildInvoiceTools>
type InvoiceUIMessage = UIMessage<unknown, never, InferUITools<InvoiceTools>>
```
- `orgId` is closed over from server context, not in inputSchema (cross-tenant safety).
- `FORCE_TOOL_ERROR` → returns `{ error: 'stats_unavailable' }`.
- `MODEL_FROM_INPUT_ORGID` → reads orgId from model input (intentional leak demo).

### `src/lib/llm/with-llm-quota.ts`
```ts
withLlmQuota(handler: (req: Request) => Promise<Response>): (req: Request) => Promise<Response>
```
Reserves quota before delegating; returns typed 429 when exceeded.

### `src/app/api/chat/route.ts`
```ts
export const POST = withLlmQuota(authedRoute('member', z.strictObject({ messages: z.array(z.unknown()) }), ...))
```
- `streamText` with `stopWhen: stepCountIs(5)`, `maxOutputTokens: 1024`.
- `onStepFinish`: addUsage + writeLlmStepEvent.
- `onFinish`: writeLlmFinishEvent.
- Returns `result.toUIMessageStreamResponse()`.

### `src/app/api/usage/route.ts`
```ts
export const GET = authedRoute('member', z.strictObject({}), async (_input, ctx) => Response.json(await readUsage(ctx.userId)))
```

### `src/app/inspector/actions.ts`
```ts
resetAndReseed(): Promise<void>
switchIdentity(formData: FormData): Promise<void>      // field: 'identity'
forceVersionDrift(formData: FormData): Promise<void>   // fields: 'orgId', 'id'
forceQuota(formData: FormData): Promise<void>          // field: 'userId' → sets tokensUsed=99_500
toggleForceToolError(): Promise<void>
toggleBypassAuthedRoute(): Promise<void>
toggleModelFromInputOrgid(): Promise<void>
```

### `src/app/(app)/invoices/page.tsx`
RSC. Reads URL via `invoiceListSearchParamsCache.parse(searchParams)`, calls `listInvoices`, renders two-column grid (`[2fr_1fr]` lg): left = ViewTabs + Toolbar + ActiveFilterChips + InvoicesTable + Pagination; right aside = TokenUsagePanel + InvoiceChat.

### `src/app/(app)/invoices/invoice-chat.tsx`
```ts
// 'use client'
InvoiceChat({ orgName: string }): JSX.Element
```
`useChat<InvoiceUIMessage>` with `DefaultChatTransport({ api: '/api/chat' })`. Renders text parts and `<InvoiceStatsCard {...part}>` for `tool-getInvoiceStats` parts.

### `src/app/(app)/invoices/invoice-stats-card.tsx`
```ts
// 'use client'
InvoiceStatsCard(part: UIToolInvocation<InvoiceTools['getInvoiceStats']>): JSX.Element
InvoiceStatsCard.Skeleton: () => JSX.Element
```
Switches on `part.state`: `input-streaming` → null, `input-available` → StatsSkeleton, `output-error` → StatsError, `output-available` → stats display or StatsError if `'error' in part.output`.

### `src/app/(app)/invoices/token-usage-panel.tsx`
```ts
// 'use client'
TokenUsagePanel(): JSX.Element
```
Polls `/api/usage` every 10s with AbortController cleanup. Color: green >50%, amber 10-50%, red <10%.

### `src/app/(app)/invoices/table.tsx`
```ts
// 'use client'
InvoicesTable({ rows: Invoice[]; view: InvoiceView; role: Role }): JSX.Element
```
`useOptimistic` for archive. `useActionState` for archiveInvoice/restoreInvoice/softDeleteInvoice. Dispatches lifecycle actions via explicit FormData (avoids `$ACTION_*` hidden inputs from bare dispatcher).

### `src/app/(app)/invoices/[id]/edit/edit-form.tsx`
```ts
// 'use client'
EditForm({ invoice: Invoice; role: Role }): JSX.Element
```
`useActionState(updateInvoice, null)`. Fields keyed on `${seed.id}:${seed.version}` for remount on "Use latest". `onSubmit` wraps dispatcher to avoid `$ACTION_*` leakage. `onOverwrite` sets `overwrite=true` in FormData (admin only, re-checked server-side).

### `src/app/(app)/invoices/[id]/edit/conflict-banner.tsx`
```ts
// 'use client'
ConflictBanner({ current: Invoice; onUseLatest: () => void; onOverwrite: () => void; canOverwrite: boolean }): JSX.Element
```

### Toolbar / ViewTabs / Pagination / ActiveFilterChips / ClearChip
- All use `nuqs` `useQueryStates` / `useQueryState` with `{ shallow: false }` to trigger RSC rerender.
- `Toolbar`: debounce 300ms on search input via `useDeferredValue` + `useTransition`.
- `ViewTabs`: hides "All" tab for non-admin.
- `Pagination`: cursor-based; "First page" clears cursor.
- `ClearChip`: clears one param + resets cursor.

### `src/app/_components/submit-button.tsx`
```ts
// 'use client'
SubmitButton({ children, pendingLabel?: string, ...ButtonProps }): JSX.Element
```
Uses `useFormStatus().pending`.

## Dependencies

### Production
| Package | Version |
|---|---|
| `next` | 16.2.7 |
| `react` / `react-dom` | 19.2.4 |
| `ai` | ^5.0.201 |
| `@ai-sdk/react` | ^2.0.203 |
| `@t3-oss/env-nextjs` | ^0.13.11 |
| `nuqs` | ^2.8.9 |
| `zod` | ^4.4.3 |
| `radix-ui` | ^1.4.3 |
| `sonner` | ^2.0.7 |
| `next-themes` | ^0.4.6 |
| `lucide-react` | ^1.17.0 |
| `clsx` | ^2.1.1 |
| `tailwind-merge` | ^3.6.0 |
| `class-variance-authority` | ^0.7.1 |
| `temporal-polyfill` | ^0.3.2 |
| `tw-animate-css` | ^1.4.0 |
| `uuidv7` | ^1.0.2 |

### Dev
| Package | Version |
|---|---|
| `typescript` | ^6.0.3 |
| `@biomejs/biome` | 2.4.16 |
| `vitest` | ^4.1.8 |
| `tailwindcss` / `@tailwindcss/postcss` | ^4.3.0 |
| `babel-plugin-react-compiler` | 1.0.0 |
| `vite-tsconfig-paths` | ^5.1.4 |

## Start diff

`start/` carries the full chapter-062 surface byte-identical to `solution/` and reverts exactly nine files to a `TODO(L<n>)` stub — the LLM feature the student builds:

- `src/lib/llm/prompts.ts`, `src/lib/llm/tools.ts`, `src/lib/llm/quota.ts`, `src/lib/llm/audit.ts` (L2–L4)
- `src/app/api/chat/route.ts`, `src/app/api/usage/route.ts` (L2, L4)
- `src/app/(app)/invoices/invoice-chat.tsx`, `invoice-stats-card.tsx`, `token-usage-panel.tsx` (L2, L5)

`src/lib/llm/with-llm-quota.ts` and `src/lib/authed-route.ts` ship complete as provided seams. Everything else (the list, store, scoped query, model registry, inspector shell, env) is identical to `solution/`. The student fills the nine stubs guided by the lesson exercises, with `solution/` as the reference.
