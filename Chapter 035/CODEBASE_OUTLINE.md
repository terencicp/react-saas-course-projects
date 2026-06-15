# Chapter 035 — Codebase Summary

## Solution file tree

```
projects/Chapter 035/solution/
├── package.json                                 — project manifest, dependencies, scripts
├── next.config.ts                               — Next.js config (cacheComponents, typedRoutes, reactCompiler, turbopack)
├── tsconfig.json                                — TypeScript strict config, path alias @/*
├── biome.json                                   — Biome formatter/linter config
├── vitest.config.ts                             — Vitest config (node env, tests/lessons/**/*.test.ts)
├── components.json                              — shadcn/ui config (new-york, CSS vars, lucide icons)
├── postcss.config.mjs                           — PostCSS with @tailwindcss/postcss
├── AGENTS.md                                    — project overview and daily commands for agents
├── scripts/
│   └── test-lesson.mjs                          — CLI runner: executes one Lesson <n>.test.ts via vitest
├── src/
│   ├── app/
│   │   ├── globals.css                          — Tailwind v4 CSS-first theme, light/dark CSS vars (oklch)
│   │   ├── layout.tsx                           — Root layout: html/body + Providers, metadata export
│   │   ├── page.tsx                             — Root page: redirects to /invoices
│   │   ├── _components/
│   │   │   └── providers.tsx                    — 'use client' ThemeProvider (next-themes) wrapper
│   │   └── invoices/
│   │       ├── layout.tsx                       — Parallel-route shell: receives {children, list, detail} slots
│   │       ├── default.tsx                      — Invoices segment default (renders null)
│   │       ├── loading.tsx                      — Invoices segment loading (two-column Skeleton grid)
│   │       ├── @list/
│   │       │   ├── page.tsx                     — List slot: parses ?status searchParam, renders InvoiceList + StatusFilter
│   │       │   ├── default.tsx                  — List slot default: same as page (prevents 404 on direct /invoices/[id])
│   │       │   └── loading.tsx                  — List slot loading: renders <ListSkeleton>
│   │       ├── @detail/
│   │       │   ├── default.tsx                  — Detail slot default: "Pick an invoice" empty state
│   │       │   └── [id]/
│   │       │       ├── page.tsx                 — Detail slot page: fetches invoice by id, notFound() on null
│   │       │       └── loading.tsx              — Detail slot loading: renders <DetailSkeleton>
│   │       ├── new/
│   │       │   └── page.tsx                     — Full-page new-invoice form with Cancel link
│   │       └── (.)new/
│   │           └── page.tsx                     — Intercepting route: wraps InvoiceForm in NewInvoiceDialog modal
│   ├── components/
│   │   ├── invoice-list.tsx                     — InvoiceList: renders scrollable list of invoice links with Badge + amount
│   │   ├── invoice-detail.tsx                   — InvoiceDetail: article with status Badge, amount, due date dl
│   │   ├── invoice-form.tsx                     — InvoiceForm: uncontrolled form (number, customer, amount, status, dueDate)
│   │   ├── new-invoice-dialog.tsx               — 'use client' NewInvoiceDialog: Dialog open, router.back() on close
│   │   ├── status-filter.tsx                    — 'use client' StatusFilter: URL-driven filter buttons via router.replace
│   │   ├── skeletons.tsx                        — ListSkeleton + DetailSkeleton composed from shadcn Skeleton
│   │   └── ui/
│   │       ├── badge.tsx                        — Badge (CVA, variants: default|secondary|destructive|outline|ghost|link)
│   │       ├── button.tsx                       — Button (CVA, variants: default|destructive|outline|secondary|ghost|link; sizes: default|xs|sm|lg|icon|icon-xs|icon-sm|icon-lg)
│   │       ├── card.tsx                         — Card family: Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter
│   │       ├── dialog.tsx                       — 'use client' Dialog family (radix-ui): Dialog, DialogTrigger, DialogPortal, DialogOverlay, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogClose
│   │       ├── separator.tsx                    — 'use client' Separator (radix-ui, horizontal/vertical)
│   │       ├── sheet.tsx                        — 'use client' Sheet (radix-ui Dialog as drawer): Sheet, SheetTrigger, SheetClose, SheetPortal, SheetOverlay, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription
│   │       └── skeleton.tsx                     — Skeleton (animate-pulse rounded div)
│   └── lib/
│       ├── utils.ts                             — cn() utility (clsx + tailwind-merge)
│       └── invoices/
│           ├── schema.ts                        — Zod schemas + TypeScript types for Invoice domain
│           ├── data.ts                          — In-memory fixture: 30 invoices (inv_001–inv_030)
│           └── queries.ts                       — Async query functions over in-memory data
└── tests/
    └── lessons/
        ├── Lesson 2.test.ts                     — describe.todo placeholder
        ├── Lesson 3.test.ts                     — describe.todo placeholder
        └── Lesson 4.test.ts                     — describe.todo placeholder
```

## Contracts

### `src/lib/invoices/schema.ts`
```ts
export const statusSchema: z.ZodEnum<['draft', 'sent', 'paid', 'overdue']>
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'
export const searchParamsSchema: z.ZodObject<{ status: statusSchema.optional() }>
export type Invoice = {
  id: string
  number: string
  customer: string
  status: InvoiceStatus
  amount: number        // cents (integer)
  dueDate: string       // YYYY-MM-DD
}
```

### `src/lib/invoices/data.ts`
```ts
export const invoices: Invoice[]  // 30 items, ids inv_001–inv_030
```

### `src/lib/invoices/queries.ts`
```ts
export const listInvoices: (filters: { status?: InvoiceStatus }) => Promise<Invoice[]>
// filters by status if provided; returns sorted ascending by dueDate

export const getInvoice: (id: string) => Promise<Invoice | null>
// artificial 600 ms delay to make streaming visible in @detail slot
```

### `src/lib/utils.ts`
```ts
export const cn: (...inputs: ClassValue[]) => string
```

### `src/app/layout.tsx`
```ts
export const metadata: Metadata  // title: 'Invoices'
export default RootLayout: ({ children: ReactNode }) => JSX.Element
```

### `src/app/page.tsx`
```ts
export default Home: () => never  // calls redirect('/invoices')
```

### `src/app/_components/providers.tsx`
```ts
// 'use client'
export const Providers: ({ children: ReactNode }) => JSX.Element
// ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange
```

### `src/app/invoices/layout.tsx`
```ts
export default InvoicesLayout: ({ children, list, detail }: LayoutProps<'/invoices'>) => JSX.Element
// data-testid="invoices-grid" — md:grid-cols-[20rem_1fr]
```

### `src/app/invoices/default.tsx`
```ts
export default InvoicesDefault: () => null
```

### `src/app/invoices/loading.tsx`
```ts
export default InvoicesLoading: () => JSX.Element
// data-testid="invoices-loading" — two-column Skeleton grid (6 rows list + header/body detail)
```

### `src/app/invoices/@list/page.tsx`
```ts
export default ListPage: async ({ searchParams }: PageProps<'/invoices'>) => JSX.Element
// safeParse searchParams → status → listInvoices({ status }) → <InvoiceList> + <StatusFilter current={status}>
```

### `src/app/invoices/@list/default.tsx`
```ts
export default ListDefault: async () => JSX.Element
// identical render to @list/page.tsx but with no status filter (serves direct /invoices/[id] visits)
```

### `src/app/invoices/@list/loading.tsx`
```ts
export default ListLoading: () => JSX.Element  // <ListSkeleton>
```

### `src/app/invoices/@detail/default.tsx`
```ts
export default DetailDefault: () => JSX.Element
// data-testid="detail-empty" — "Pick an invoice to see its details" empty state
```

### `src/app/invoices/@detail/[id]/page.tsx`
```ts
export default DetailPage: async ({ params }: PageProps<'/invoices/[id]'>) => JSX.Element
// getInvoice(id) → notFound() on null → <InvoiceDetail invoice={invoice}>
```

### `src/app/invoices/@detail/[id]/loading.tsx`
```ts
export default DetailLoading: () => JSX.Element  // <DetailSkeleton>
```

### `src/app/invoices/new/page.tsx`
```ts
export default NewPage: () => JSX.Element
// full-page form: <InvoiceForm> + Cancel <Link href="/invoices">
```

### `src/app/invoices/(.)new/page.tsx`
```ts
export default InterceptedNewPage: () => JSX.Element
// intercepting route: <NewInvoiceDialog><InvoiceForm /></NewInvoiceDialog>
```

### `src/components/invoice-list.tsx`
```ts
export const InvoiceList: ({ invoices }: { invoices: Invoice[] }) => JSX.Element
// data-testid="invoices-list" — each item is a Link to /invoices/${id}
// empty state: "No invoices" paragraph
// amounts formatted via Intl.NumberFormat USD (amount / 100)
```

### `src/components/invoice-detail.tsx`
```ts
export const InvoiceDetail: ({ invoice }: { invoice: Invoice }) => JSX.Element
// data-testid="invoice-detail" — article with number h1, customer, status Badge, amount, dueDate dl
```

### `src/components/invoice-form.tsx`
```ts
export const InvoiceForm: () => JSX.Element
// data-testid="invoice-form" — uncontrolled fields: number, customer, amount, status (select from statusSchema.options), dueDate
// submit not wired (Server Actions deferred to Unit 6)
```

### `src/components/new-invoice-dialog.tsx`
```ts
// 'use client'
export const NewInvoiceDialog: ({ children }: { children: ReactNode }) => JSX.Element
// data-testid="new-invoice-dialog" — Dialog always open, onOpenChange→router.back() on close
```

### `src/components/status-filter.tsx`
```ts
// 'use client'
export const StatusFilter: ({ current }: { current?: InvoiceStatus }) => JSX.Element
// data-testid="status-filter" — pill buttons for All|draft|sent|paid|overdue
// active pill: variant="default", inactive: variant="outline", aria-pressed
// selection: router.replace('/invoices?status=…', { scroll: false })
```

### `src/components/skeletons.tsx`
```ts
export const ListSkeleton: () => JSX.Element   // data-testid="list-skeleton" — 6 Skeleton rows (h-12)
export const DetailSkeleton: () => JSX.Element // data-testid="detail-skeleton" — heading + subtitle + separator + body Skeletons
```

### `src/components/ui/badge.tsx`
```ts
export const badgeVariants: CVA  // variants: default|secondary|destructive|outline|ghost|link
export function Badge(props: ComponentProps<'span'> & VariantProps<badgeVariants> & { asChild?: boolean }): JSX.Element
```

### `src/components/ui/button.tsx`
```ts
export const buttonVariants: CVA  // variants: default|destructive|outline|secondary|ghost|link; sizes: default|xs|sm|lg|icon|icon-xs|icon-sm|icon-lg
export function Button(props: ComponentProps<'button'> & VariantProps<buttonVariants> & { asChild?: boolean }): JSX.Element
```

### `src/components/ui/card.tsx`
```ts
export function Card(props: ComponentProps<'div'>): JSX.Element
export function CardHeader(props: ComponentProps<'div'>): JSX.Element
export function CardTitle(props: ComponentProps<'div'>): JSX.Element
export function CardDescription(props: ComponentProps<'div'>): JSX.Element
export function CardAction(props: ComponentProps<'div'>): JSX.Element
export function CardContent(props: ComponentProps<'div'>): JSX.Element
export function CardFooter(props: ComponentProps<'div'>): JSX.Element
```

### `src/components/ui/dialog.tsx`
```ts
// 'use client' — wraps radix-ui Dialog
export function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>): JSX.Element
export function DialogTrigger(props): JSX.Element
export function DialogPortal(props): JSX.Element
export function DialogClose(props): JSX.Element
export function DialogOverlay(props): JSX.Element
export function DialogContent(props: ... & { showCloseButton?: boolean }): JSX.Element
export function DialogHeader(props: ComponentProps<'div'>): JSX.Element
export function DialogFooter(props: ComponentProps<'div'> & { showCloseButton?: boolean }): JSX.Element
export function DialogTitle(props): JSX.Element
export function DialogDescription(props): JSX.Element
```

### `src/components/ui/separator.tsx`
```ts
// 'use client'
export function Separator(props: ComponentProps<typeof SeparatorPrimitive.Root>): JSX.Element
// defaults: orientation='horizontal', decorative=true
```

### `src/components/ui/sheet.tsx`
```ts
// 'use client' — radix-ui Dialog used as side drawer
export function Sheet, SheetTrigger, SheetClose, SheetPortal, SheetOverlay: standard wrappers
export function SheetContent(props: ... & { side?: 'top'|'right'|'bottom'|'left'; showCloseButton?: boolean }): JSX.Element
export function SheetHeader, SheetFooter, SheetTitle, SheetDescription: standard wrappers
```

### `src/components/ui/skeleton.tsx`
```ts
export function Skeleton(props: ComponentProps<'div'>): JSX.Element  // animate-pulse rounded-md bg-accent
```

### `scripts/test-lesson.mjs`
```ts
// Usage: pnpm test:lesson <n>
// Resolves tests/lessons/Lesson <n>.test.ts, spawns vitest run on it
```

### `vitest.config.ts`
```ts
// environment: 'node', globals: false
// include: ['tests/lessons/**/*.test.ts']
// tsconfigPaths: true
```

## Dependencies

**Runtime**
| Package | Version |
|---|---|
| next | 16.2.7 |
| react | 19.2.4 |
| react-dom | 19.2.4 |
| zod | ^4.4.3 |
| radix-ui | ^1.4.3 |
| next-themes | ^0.4.6 |
| class-variance-authority | ^0.7.1 |
| clsx | ^2.1.1 |
| tailwind-merge | ^3.6.0 |
| lucide-react | ^1.17.0 |
| tw-animate-css | ^1.4.0 |

**Dev**
| Package | Version |
|---|---|
| typescript | ^6.0.3 |
| @biomejs/biome | 2.4.16 |
| tailwindcss | ^4.3.0 |
| @tailwindcss/postcss | ^4.3.0 |
| vitest | ^4.1.8 |
| babel-plugin-react-compiler | 1.0.0 |
| @types/node | ^25.9.1 |
| @types/react | ^19.2.16 |
| @types/react-dom | ^19.2.3 |

## Start diff

The start and solution have the same file structure except **start has `README.md`** (a 4-line project description) which is absent from solution.

All config files (`next.config.ts`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, `components.json`, `postcss.config.mjs`, `package.json`, `AGENTS.md`, `scripts/test-lesson.mjs`) and all shared/library files (`src/lib/**`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/_components/providers.tsx`, `src/app/invoices/layout.tsx`, `src/app/invoices/default.tsx`, `src/components/invoice-list.tsx`, `src/components/invoice-detail.tsx`, `src/components/invoice-form.tsx`, `src/components/status-filter.tsx`, `src/components/ui/**`, `src/lib/utils.ts`) are **identical** between start and solution.

Files that differ (start has stub + TODO, solution has implementation):

| File | Start stub | Solution |
|---|---|---|
| `src/app/invoices/@list/page.tsx` | Returns "List slot" placeholder | Parses searchParams, calls listInvoices, renders InvoiceList + StatusFilter |
| `src/app/invoices/@list/default.tsx` | Returns "List slot" placeholder | Same full render as @list/page (prevents 404 on direct detail visit) |
| `src/app/invoices/@list/loading.tsx` | Returns "Loading list…" text | Returns `<ListSkeleton>` |
| `src/app/invoices/@detail/[id]/page.tsx` | Returns "Detail slot" placeholder | Fetches invoice, calls notFound() on null, renders InvoiceDetail |
| `src/app/invoices/@detail/default.tsx` | Returns "Detail slot" placeholder | Returns "Pick an invoice" empty state with data-testid="detail-empty" and sticky positioning |
| `src/app/invoices/@detail/[id]/loading.tsx` | Returns "Loading detail…" text | Returns `<DetailSkeleton>` |
| `src/app/invoices/new/page.tsx` | Returns "New invoice page" placeholder | Full form page with InvoiceForm + Cancel link |
| `src/app/invoices/(.)new/page.tsx` | Renders children passthrough | Wraps InvoiceForm in NewInvoiceDialog |
| `src/components/new-invoice-dialog.tsx` | Passthrough fragment, no Dialog | Full Dialog with useRouter().back() on close |
| `src/components/skeletons.tsx` | Empty div stubs (correct testids) | Skeleton rows and blocks with actual Skeleton children |

**TODO comments in start (all resolved in solution):**

- `src/app/invoices/@list/page.tsx:2` — `TODO(L2)` async @list: await+safeParse searchParams, listInvoices({ status }), render InvoiceList + StatusFilter
- `src/app/invoices/@list/default.tsx:2` — `TODO(L2)` same content as @list/page.tsx
- `src/app/invoices/@list/loading.tsx:2` — `TODO(L4)` render ListSkeleton
- `src/app/invoices/@detail/[id]/page.tsx:2` — `TODO(L2)` async @detail: await params, getInvoice(id), notFound() on null, render InvoiceDetail
- `src/app/invoices/@detail/default.tsx:2` — `TODO(L2)` "pick an invoice" empty state (data-testid="detail-empty"), NOT a 404
- `src/app/invoices/@detail/[id]/loading.tsx:2` — `TODO(L4)` render DetailSkeleton
- `src/app/invoices/new/page.tsx:2` — `TODO(L3)` full-page twin: InvoiceForm + Cancel Link href="/invoices"
- `src/app/invoices/(.)new/page.tsx:2` — `TODO(L3)` intercepting modal: InvoiceForm inside Dialog closing via router.back()
- `src/components/new-invoice-dialog.tsx:6` — `TODO(L3)` 'use client' Dialog wrapper: open, onOpenChange→router.back(), renders children
- `src/components/skeletons.tsx:1` — `TODO(L4)` ListSkeleton + DetailSkeleton over shadcn Skeleton, stable string keys

Lesson grouping: L2 = parallel routes + data fetching; L3 = intercepting modal; L4 = skeleton loading states.
