# Chapter 085 — Codebase Summary

## Solution file tree

```
projects/Chapter 085/solution/
├── next.config.ts                          — Next 16 config: Cache Components, typed routes, React Compiler, next-intl plugin
├── vitest.config.ts                        — Vitest (node env, lesson-verification/**/*.ts)
├── biome.json                              — Biome linter/formatter config
├── tsconfig.json                           — TypeScript config
├── components.json                         — shadcn/ui registry config
├── postcss.config.mjs                      — PostCSS / Tailwind v4 config
├── src/
│   ├── global.ts                           — Augments next-intl AppConfig with real Locale/Messages/Formats types
│   ├── proxy.ts                            — next-intl middleware (locale negotiation); exports matcher config
│   ├── i18n/
│   │   ├── routing.ts                      — defineRouting: locales, defaultLocale, localePrefix 'as-needed'
│   │   ├── navigation.ts                   — createNavigation: exports Link, redirect, usePathname, useRouter, getPathname
│   │   ├── request.ts                      — getRequestConfig: validates locale, dynamic-imports message catalog, returns formats
│   │   └── formats.ts                      — Shared next-intl Formats presets (dateTime.short/withTime, number.compact/currency)
│   ├── lib/
│   │   ├── utils.ts                        — cn() (clsx + tailwind-merge)
│   │   ├── result.ts                       — Result<T> discriminated union + ok/err/conflict constructors
│   │   ├── authed-action.ts                — authedAction() higher-order function: session → RBAC → parse → fn
│   │   ├── temporal.ts                     — Temporal polyfill seam; exports Temporal, instantFromString, plainDateFromString
│   │   ├── user-time.ts                    — getCurrentUserTimeZone/getCurrentUserLocale (react cache, server-only)
│   │   ├── i18n/
│   │   │   └── supported.ts               — SUPPORTED_LOCALES constant + Locale type
│   │   ├── invoices/
│   │   │   ├── search-params.ts           — nuqs parsers + invoiceListSearchParamsCache
│   │   │   ├── scoped-query.ts            — scopedInvoices(orgId): active/archived/includingDeleted views; InvoiceQuery builder
│   │   │   ├── queries.ts                 — listInvoices, getInvoiceDetail, toInvoiceRow, types: InvoiceSort/InvoiceView/ListParsed/InvoiceRow
│   │   │   └── actions.ts                 — updateInvoice, archiveInvoice, restoreInvoice, softDeleteInvoice (Server Actions)
│   │   └── seo/
│   │       ├── alternates.ts              — generateAlternates(pathname, locale): canonical + hreflang languages map
│   │       └── og-locale.ts              — bcp47ToOgLocale(locale): converts 'fr-FR' → 'fr_FR'
│   ├── server/
│   │   ├── types.ts                        — Invoice, AuditLog, InvoiceStatus, Role, UserProfile types; roleAtLeast()
│   │   ├── session.ts                      — getSession(), setActingIdentity(): cookie-driven dev session
│   │   └── store.ts                        — In-memory "Postgres": users[], invoices[], auditLogs[]; reseed(), findInvoice(), setUserLocale(), setUserTimeZone(), pushAudit()
│   ├── messages/
│   │   ├── en-US.json                      — Source-of-truth catalog (nav, locale-switcher, invoices.list, marketing.*)
│   │   ├── en-GB.json                      — British English variant (localised/time-zone spellings, same key shape)
│   │   └── fr-FR.json                      — Full French translation (plural many branch, all keys translated)
│   ├── app/
│   │   ├── layout.tsx                      — Root layout: bare fragment, no html/body (each segment owns its document)
│   │   ├── globals.css                     — Global Tailwind CSS
│   │   ├── robots.ts                       — MetadataRoute.Robots: allow all, sitemap URL
│   │   ├── sitemap.ts                      — MetadataRoute.Sitemap: PATHS × locales with xhtml:link alternates
│   │   ├── _components/
│   │   │   ├── providers.tsx              — Providers: ThemeProvider (next-themes, system)
│   │   │   └── submit-button.tsx          — SubmitButton: useFormStatus pending → disabled + label swap
│   │   ├── [locale]/
│   │   │   ├── layout.tsx                  — LocaleLayout: generateStaticParams, setRequestLocale, NuqsAdapter, NextIntlClientProvider (scoped messages)
│   │   │   ├── (marketing)/
│   │   │   │   ├── layout.tsx              — MarketingLayout: header nav + LocaleSwitcher
│   │   │   │   ├── opengraph-image.tsx     — OG image route
│   │   │   │   ├── page.tsx               — Marketing home: generateMetadata (alternates + OG), t('marketing.home.*')
│   │   │   │   ├── pricing/page.tsx       — Pricing page: generateMetadata + t('marketing.pricing.*')
│   │   │   │   └── features/page.tsx      — Features page: generateMetadata + t('marketing.features.*')
│   │   │   └── (app)/
│   │   │       ├── layout.tsx              — AppLayout: generateMetadata(robots noindex), header nav + LocaleSwitcher
│   │   │       └── invoices/
│   │   │           ├── page.tsx           — InvoicesPage: reads session/parsed/tz, computes dueInDaysById, renders list
│   │   │           ├── loading.tsx        — Skeleton loading state
│   │   │           ├── table.tsx          — InvoicesTable (client): format.dateTime/number/relativeTime, optimistic archive, lifecycle actions
│   │   │           ├── toolbar.tsx        — Toolbar (client): status/sort selects + debounced search via nuqs
│   │   │           ├── view-tabs.tsx      — ViewTabs (client): active/archived/all tabs, RBAC hides all for non-admin
│   │   │           ├── pagination.tsx     — Pagination (client): first-page + next via nuqs cursor
│   │   │           ├── active-filter-chips.tsx — ActiveFilterChips: status/q/sort clear chips
│   │   │           ├── clear-chip.tsx     — ClearChip (client): clears one nuqs param + resets cursor
│   │   │           ├── locale-switcher.tsx — LocaleSwitcher (client): setLocaleAction + router.replace with locale
│   │   │           ├── actions.ts         — setLocaleAction: writes store profile + NEXT_LOCALE cookie
│   │   │           └── [id]/edit/
│   │   │               ├── page.tsx       — EditInvoicePage: generateStaticParams(locale × invoice ids), getInvoiceDetail
│   │   │               ├── edit-form.tsx  — EditForm (client): useActionState(updateInvoice), conflict resolution, overwrite
│   │   │               ├── conflict-banner.tsx — ConflictBanner (client): shows server's current row, Use latest / Overwrite
│   │   │               └── loading.tsx    — Skeleton loading state
│   │   └── inspector/
│   │       ├── layout.tsx                  — InspectorLayout: fixed en-US document shell, Suspense-wrapped NextIntlClientProvider
│   │       ├── page.tsx                   — InspectorPage: row counts, identity switcher, locale/tz override, DST proof, currency grid, plural probe, hreflang panel, sitemap preview, force-version-drift, audit tail
│   │       ├── actions.ts                 — resetAndReseed, switchIdentity, setLocaleOverride, setTimeZoneOverride, forceVersionDrift
│   │       ├── plural-probe.tsx           — PluralProbe (client): createTranslator per locale, live count input
│   │       └── loading.tsx                — Skeleton loading state
│   └── components/ui/
│       ├── button.tsx, badge.tsx, card.tsx, dialog.tsx, dropdown-menu.tsx,
│       ├── input.tsx, label.tsx, select.tsx, separator.tsx, skeleton.tsx,
│       └── sonner.tsx                     — shadcn/ui components (verbatim, no student work)
```

## Contracts

### `src/lib/i18n/supported.ts`
```ts
export const SUPPORTED_LOCALES = ['en-US', 'en-GB', 'fr-FR'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
```

### `src/i18n/routing.ts`
```ts
export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: 'en-US',
  localePrefix: 'as-needed',
})
export type Locale = (typeof routing.locales)[number]
```

### `src/i18n/navigation.ts`
```ts
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
```

### `src/i18n/formats.ts`
```ts
export const formats = {
  dateTime: { short: { dateStyle: 'medium' }, withTime: { dateStyle: 'medium', timeStyle: 'short' } },
  number: { compact: { notation: 'compact' }, currency: { style: 'currency', currencyDisplay: 'narrowSymbol' } },
} as const satisfies Formats
```

### `src/global.ts`
Augments `next-intl` `AppConfig` with `Locale`, `Messages` (from en-US.json), `Formats` (from formats.ts). No exports.

### `src/proxy.ts`
```ts
export default createMiddleware(routing)
export const config = { matcher: ['/((?!api|_next|_vercel|inspector|.*\\..*).*)'] }
```

### `src/lib/result.ts`
```ts
export type ErrorCode = 'validation' | 'conflict' | 'not_found' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'internal'
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; userMessage: string; fieldErrors?: Record<string, string[]>; current?: unknown } }
export const ok = <T>(data: T): Result<T>
export const err = (code: ErrorCode, userMessage: string, fieldErrors?: Record<string, string[]>): Result<never>
export const conflict = <T>(userMessage: string, current: T): Result<never>
```

### `src/lib/authed-action.ts`
```ts
export type AuthedCtx = { session: Session; orgId: string; userId: string; role: Role }
export const authedAction: <TSchema extends z.ZodType, TOut>(
  role: Role,
  schema: TSchema,
  fn: (input: z.infer<TSchema>, ctx: AuthedCtx) => Promise<Result<TOut>>,
) => (_prev: Result<TOut> | null, formData: FormData) => Promise<Result<TOut>>
```

### `src/lib/temporal.ts`
```ts
export const Temporal  // globalThis.Temporal ?? polyfill
export const instantFromString = (s: string): Temporal.Instant
export const plainDateFromString = (s: string): Temporal.PlainDate
```

### `src/lib/user-time.ts`
```ts
export const getCurrentUserTimeZone: () => Promise<string>   // react cache
export const getCurrentUserLocale: () => Promise<Locale>     // react cache
```

### `src/lib/seo/alternates.ts`
```ts
export const APP_URL = 'https://app.example.com'
type Alternates = { canonical: string; languages: Record<string, string> }
export const generateAlternates = (pathname: string, currentLocale: Locale): Alternates
```

### `src/lib/seo/og-locale.ts`
```ts
export const bcp47ToOgLocale = (locale: Locale): string  // 'fr-FR' → 'fr_FR'
```

### `src/lib/utils.ts`
```ts
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
```

### `src/server/types.ts`
```ts
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'
export type Role = 'owner' | 'admin' | 'member'
export const roleAtLeast = (role: Role, required: Role): boolean
export type Invoice = {
  id: string; orgId: string; number: string; customerName: string; status: InvoiceStatus;
  amountMinor: number; total: string; currency: string;
  createdAt: Temporal.Instant; dueDate: Temporal.PlainDate;
  deletedAt: string | null; archivedAt: string | null; version: number;
}
export type AuditLog = { id: string; orgId: string; actorUserId: string; action: string; subjectId: string; createdAt: string }
export type UserProfile = { locale: Locale; timeZone: string }
```

### `src/server/session.ts`
```ts
// Cookie name: 'acting-identity', default: 'org-acme:admin'
export type Session = { userId: string; orgId: string; role: Role; locale: Locale; timeZone: string }
export const getSession = async (): Promise<Session>
export const setActingIdentity = async (value: string): Promise<void>  // 'use server'
```

### `src/server/store.ts`
```ts
export type StoreUser = { id: string; orgId: string; role: Role; locale: Locale; timeZone: string }
export const users: StoreUser[]     // 4 users: org-acme (admin en-US/NY, member en-GB/London), org-globex (admin fr-FR/Paris, member fr-FR/Auckland)
export const invoices: Invoice[]    // seeded: 30 org-acme + 30 org-globex + 2 DST fixtures + 1 archived + 1 deleted
export const auditLogs: AuditLog[]
export const reseed = (): void
export const findInvoice = (orgId: string, id: string): Invoice | undefined
export const setUserLocale = (userId: string, locale: Locale): void
export const setUserTimeZone = (userId: string, timeZone: string): void
export const pushAudit = (entry: Omit<AuditLog, 'id' | 'createdAt'>): void
```

### `src/lib/invoices/search-params.ts`
```ts
export const invoiceListSearchParams = {
  status: parseAsStringEnum(['draft', 'sent', 'paid', 'overdue']),
  sort: parseAsStringEnum(['-createdAt', 'createdAt', '-total', 'total', '-customer', 'customer']).withDefault('-createdAt'),
  q: parseAsString.withDefault(''),
  view: parseAsStringEnum(['active', 'archived', 'all']).withDefault('active'),
  cursor: parseAsString,
}
export const invoiceListSearchParamsCache = createSearchParamsCache(invoiceListSearchParams)
```

### `src/lib/invoices/scoped-query.ts`
```ts
export const activeFilter = (inv: Invoice): boolean   // deletedAt===null && archivedAt===null
export const archivedFilter = (inv: Invoice): boolean // archivedAt!==null && deletedAt===null
export type InvoiceQuery = {
  filter: (predicate: (inv: Invoice) => boolean) => InvoiceQuery
  sort: (compare: (a: Invoice, b: Invoice) => number) => InvoiceQuery
  cursorAfter: (cursor: string | null) => InvoiceQuery
  take: (n: number) => Invoice[]
  hasPrev: () => boolean
  hasMoreThan: (n: number) => boolean
  find: (predicate: (inv: Invoice) => boolean) => Invoice | undefined
}
export const scopedInvoices = (orgId: string): { active: () => InvoiceQuery; archived: () => InvoiceQuery; includingDeleted: () => InvoiceQuery }
```

### `src/lib/invoices/queries.ts`
```ts
export type InvoiceSort = '-createdAt' | 'createdAt' | '-total' | 'total' | '-customer' | 'customer'
export type InvoiceView = 'active' | 'archived' | 'all'
export type ListParsed = { status: InvoiceStatus | null; sort: InvoiceSort; view: InvoiceView; q: string; cursor: string | null }
export type ListInvoicesArgs = { orgId: string; view: InvoiceView; status: InvoiceStatus | null; sort: InvoiceSort; q: string; cursor: string | null; role: Role; pageSize?: number }
export type ListInvoicesResult = { rows: Invoice[]; nextCursor: string | null; hasPrev: boolean }
export type InvoiceRow = Omit<Invoice, 'createdAt' | 'dueDate'> & { createdAtMs: number; dueDateISO: string }
export const toInvoiceRow = (invoice: Invoice): InvoiceRow
export const listInvoices = (args: ListInvoicesArgs): ListInvoicesResult
export type GetInvoiceDetailArgs = { orgId: string; id: string; role: Role }
export const getInvoiceDetail = (args: GetInvoiceDetailArgs): Invoice | null
```

### `src/lib/invoices/actions.ts`
```ts
// updateInvoiceSchema: { id, customerName, status, total, version (coerce int), overwrite (coerce bool, default false) }
export const updateInvoice: (_prev: Result<InvoiceRow> | null, formData: FormData) => Promise<Result<InvoiceRow>>
// lifecycle schema: { id, version (coerce int) }
export const archiveInvoice: (_prev: Result<InvoiceRow> | null, formData: FormData) => Promise<Result<InvoiceRow>>   // 'member'
export const restoreInvoice: (_prev: Result<InvoiceRow> | null, formData: FormData) => Promise<Result<InvoiceRow>>   // 'member'
export const softDeleteInvoice: (_prev: Result<InvoiceRow> | null, formData: FormData) => Promise<Result<InvoiceRow>> // 'admin'
```

### `src/app/[locale]/(app)/invoices/actions.ts`
```ts
// setLocaleAction: writes store profile + 'NEXT_LOCALE' cookie
export const setLocaleAction: (_prev: Result<null> | null, formData: FormData) => Promise<Result<null>>  // 'member'
```

### `src/app/inspector/actions.ts`
```ts
export const resetAndReseed = async (): Promise<void>
export const switchIdentity = async (formData: FormData): Promise<void>
export const setLocaleOverride = async (formData: FormData): Promise<void>
export const setTimeZoneOverride = async (formData: FormData): Promise<void>
export const forceVersionDrift = async (formData: FormData): Promise<void>
```

### Client components (key props)
```ts
InvoicesTable({ rows: InvoiceRow[]; view: InvoiceView; role: Role; timeZone: string; nowMs: number; dueInDaysById: Record<string, number> })
Toolbar({ parsed: ListParsed })
ViewTabs({ parsed: ListParsed; role: Role })
Pagination({ cursor: string | null; nextCursor: string | null; hasPrev: boolean })
ActiveFilterChips({ parsed: ListParsed })
ClearChip({ param: 'status' | 'q' | 'sort'; label: string })
LocaleSwitcher()   // no props; reads locale from store via router
EditForm({ invoice: InvoiceRow; role: Role })
ConflictBanner({ current: InvoiceRow; onUseLatest: () => void; onOverwrite: () => void; canOverwrite: boolean })
SubmitButton({ pendingLabel?: string; ...ButtonProps })
PluralProbe({ catalogs: Record<Locale, Record<string, unknown>> })
Providers({ children: ReactNode })
```

### `src/app/sitemap.ts`
Returns `MetadataRoute.Sitemap` for paths `['/', '/pricing', '/features']` with `alternates.languages` per locale via `getPathname`.

### `src/app/robots.ts`
Returns `{ rules: { userAgent: '*', allow: '/' }, sitemap: APP_URL + '/sitemap.xml' }`.

### Message catalog shape (en-US.json key paths)
`nav.*`, `locale-switcher.*`, `invoices.list.{title, count (ICU plural), empty, selectPrompt, columns.*, status.*, tabs.*, toolbar.{sort.*, statusPlaceholder, statusAll, searchPlaceholder}, pagination.*, badge.*, actions.*}`, `marketing.{meta.home/pricing/features, home, pricing, features}`.

## Dependencies

| Package | Version |
|---|---|
| next | 16.2.7 |
| react | 19.2.4 |
| react-dom | 19.2.4 |
| next-intl | ^4.5.0 |
| next-themes | ^0.4.6 |
| nuqs | ^2.8.9 |
| zod | ^4.4.3 |
| temporal-polyfill | ^0.3.0 |
| radix-ui | ^1.4.3 |
| class-variance-authority | ^0.7.1 |
| clsx | ^2.1.1 |
| tailwind-merge | ^3.6.0 |
| lucide-react | ^1.17.0 |
| sonner | ^2.0.7 |
| uuidv7 | ^1.0.2 |
| tw-animate-css | ^1.4.0 |
| @biomejs/biome | 2.4.16 |
| tailwindcss | ^4.3.0 |
| @tailwindcss/postcss | ^4.3.0 |
| typescript | ^6.0.3 |
| vitest | ^4.1.8 |
| vite-tsconfig-paths | ^5.1.4 |
| babel-plugin-react-compiler | 1.0.0 |

## Start diff

**Files present in solution but absent in start:** none — the file tree is identical.

**Files with meaningful differences:**

- `src/messages/en-GB.json` — start has `{ "_todo": "TODO(L2) — diff against en-US (~15 keys: colour, date order)" }`. Solution has the full British English catalog (British spellings: "localised", "time zone", same key shape as en-US).

- `src/messages/fr-FR.json` — start has `{ "_todo": "TODO(L2) — full French translation incl the plural many branch + =0" }`. Solution has the complete French catalog with translated strings and the ICU `many` plural branch (`{count, plural, =0 {Aucune facture} one {# facture} many {# de factures} other {# factures}}`).

- `src/i18n/formats.ts` — start exports `{} as const satisfies Formats` (empty). Solution adds `dateTime.short/withTime` and `number.compact/currency` presets. TODO comment: `TODO(L2) — dateTime/number(compact); TODO(L3) — number.currency`.

- `src/app/[locale]/(app)/invoices/page.tsx` — start: no `setRequestLocale`, no `getTranslations`, no `getCurrentUserTimeZone`, no `dueInDaysById` computation; heading hard-coded as "Invoices", no count paragraph, `InvoicesTable` receives only `rows/view/role`. Solution adds `setRequestLocale`, reads `t`, computes `tz`/`nowMs`/`dueInDaysById` with `Temporal.Now.plainDateISO`, passes all to table. TODOs: `TODO(L2) — route strings through t() + counter via ICU plural` and `TODO(L3) — dates in profile tz + currency from data + relative-due`.

- `src/app/[locale]/(app)/invoices/table.tsx` — start: no `useTranslations`/`useFormatter`, component accepts only `{rows, view, role}`, column headers hard-coded ("Number", "Customer", "Status", "Total"), status rendered raw via `capitalize`, amount as `{row.currency} {row.total}`, archived-on via `toLocaleDateString()`. No date/due columns. Solution adds `useTranslations`/`useFormatter`, accepts `timeZone`/`nowMs`/`dueInDaysById`, routes all strings through `t()`, adds date column with `format.dateTime(..., {timeZone})`, due column with `format.relativeTime`, amount via `format.number(amountMinor/100, 'currency', {currency})`. TODOs: `TODO(L2) — t() for labels/status` and `TODO(L3) — format.dateTime/number + relativeTime`.

- `src/app/[locale]/(marketing)/page.tsx` — start: no `generateMetadata`. Solution adds `generateMetadata` with `generateAlternates`, OG tags, `bcp47ToOgLocale`. TODO: `TODO(L4) — generateMetadata with getTranslations + generateAlternates + per-locale OG`.

- `src/app/[locale]/(marketing)/pricing/page.tsx` — same pattern as home: start lacks `generateMetadata`. Same TODO comment.

- `src/app/[locale]/(marketing)/features/page.tsx` — same pattern as pricing.

**TODO comments in start (by file):**

| File | TODO |
|---|---|
| `src/messages/en-GB.json` | `TODO(L2) — diff against en-US (~15 keys: colour, date order)` |
| `src/messages/fr-FR.json` | `TODO(L2) — full French translation incl the plural many branch + =0` |
| `src/i18n/formats.ts` | `TODO(L2) — dateTime/number(compact); TODO(L3) — number.currency` |
| `src/app/[locale]/(app)/invoices/page.tsx` | `TODO(L2) — route strings through t() + counter via ICU plural`; `TODO(L3) — dates in profile tz + currency from data + relative-due` |
| `src/app/[locale]/(app)/invoices/table.tsx` | `TODO(L2) — t() for labels/status`; `TODO(L3) — format.dateTime/number + relativeTime` |
| `src/app/[locale]/(marketing)/page.tsx` | `TODO(L4) — generateMetadata with getTranslations + generateAlternates + per-locale OG` |
| `src/app/[locale]/(marketing)/pricing/page.tsx` | `TODO(L4) — generateMetadata with getTranslations + generateAlternates + per-locale OG` |
| `src/app/[locale]/(marketing)/features/page.tsx` | `TODO(L4) — generateMetadata with getTranslations + generateAlternates + per-locale OG` |

**Lesson progression implied by TODO labels:**
- L1: catalog wiring (next-intl setup, request config, message loading) — provided in full
- L2: route UI strings through `t()` + fill en-GB/fr-FR catalogs + add formats presets
- L3: formatter seam — `format.dateTime` (with tz), `format.number` (currency from data), `format.relativeTime` (Temporal due delta)
- L4: SEO — `generateMetadata` with `generateAlternates`, OG locale tags
