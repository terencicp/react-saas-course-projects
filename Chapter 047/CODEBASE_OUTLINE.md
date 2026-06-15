# Chapter 047 — Codebase Summary

## Solution file tree

```
projects/Chapter 047/solution/
├── package.json                                          — project manifest (chapter-047-invoices-crud), scripts, deps
├── next.config.ts                                        — Next.js config (cacheComponents, typedRoutes, reactCompiler, turbopack)
├── tsconfig.json                                         — TypeScript strict config, path alias @/*
├── biome.json                                            — Biome formatter/linter config (single-quote, organizeImports)
├── vitest.config.ts                                      — Vitest config (node env, tests/lessons/**/*.test.ts)
├── drizzle.config.ts                                     — Drizzle Kit config (postgresql, snake_case, ./drizzle out)
├── docker-compose.yml                                    — Postgres service on port 5432
├── .env.example                                          — sample env vars (DATABASE_URL, DATABASE_URL_UNPOOLED, SEED)
├── AGENTS.md                                             — project overview and daily commands for agents
├── scripts/
│   ├── seed.ts                                           — deterministic, idempotent seed (runSeed export + CLI entry)
│   └── test-lesson.mjs                                   — CLI runner: executes one Lesson <n>.test.ts via vitest
├── drizzle/
│   └── 0000_init_schema.sql                              — generated init migration (enums + 6 tables)
├── tests/lessons/
│   ├── Lesson 2.test.ts                                  — placeholder (describe.todo)
│   ├── Lesson 3.test.ts                                  — placeholder (describe.todo)
│   ├── Lesson 4.test.ts                                  — placeholder (describe.todo)
│   ├── Lesson 5.test.ts                                  — placeholder (describe.todo)
│   └── Lesson 6.test.ts                                  — placeholder (describe.todo)
└── src/
    ├── env.ts                                            — @t3-oss/env-nextjs boundary (DATABASE_URL, DATABASE_URL_UNPOOLED, SEED)
    ├── app/
    │   ├── globals.css                                   — Tailwind v4 CSS-first theme, light/dark CSS vars
    │   ├── layout.tsx                                    — root layout: Providers + Toaster
    │   ├── page.tsx                                      — root page: redirect('/invoices')
    │   ├── _components/
    │   │   ├── providers.tsx                             — ThemeProvider (next-themes) client wrapper
    │   │   ├── submit-button.tsx                         — useFormStatus-aware submit button with pending spinner
    │   │   └── field-error.tsx                           — renders first fieldErrors[name] message with role=alert
    │   └── invoices/
    │       ├── page.tsx                                  — invoice list page (RSC): fetches rows + customers, renders list + delete toast
    │       ├── loading.tsx                               — skeleton loading UI for /invoices
    │       ├── _components/
    │       │   ├── optimistic-invoices-list.tsx          — client list with useOptimistic + addOptimistic context
    │       │   └── deleted-toast.tsx                     — client island: fires Sonner toast from ?deleted URL param
    │       ├── new/
    │       │   ├── page.tsx                              — /invoices/new RSC: fetches customers, renders NewInvoiceForm
    │       │   ├── loading.tsx                           — skeleton loading UI for /invoices/new
    │       │   └── new-invoice-form.tsx                  — client form: useActionState(createInvoice); optimistic-aware via context
    │       └── [invoiceId]/
    │           ├── page.tsx                              — invoice detail RSC: getInvoiceDetail → notFound guard, edit + delete forms
    │           ├── loading.tsx                           — skeleton loading UI for /invoices/[invoiceId]
    │           ├── edit-invoice-form.tsx                 — client form: useActionState(updateInvoice), echoed defaults on failed submit
    │           └── delete-invoice-form.tsx               — client form: useActionState(deleteInvoice), Dialog confirm + no-JS fallback
    ├── components/ui/
    │   ├── button.tsx                                    — CVA Button (variants: default/destructive/outline/secondary/ghost/link; Slot support)
    │   ├── badge.tsx                                     — CVA Badge (variants: default/secondary/destructive/outline/ghost/link)
    │   ├── card.tsx                                      — Card + CardHeader/Title/Description/Action/Content/Footer
    │   ├── dialog.tsx                                    — Radix Dialog wrapper: Dialog/Trigger/Content/Header/Footer/Title/Description/Close
    │   ├── input.tsx                                     — Input (thin wrapper over <input> with aria-invalid styling)
    │   ├── label.tsx                                     — Radix Label wrapper
    │   ├── native-select.tsx                             — NativeSelect + NativeSelectOption + NativeSelectOptGroup
    │   ├── separator.tsx                                 — Radix Separator (horizontal/vertical)
    │   ├── skeleton.tsx                                  — Skeleton (animate-pulse placeholder)
    │   └── sonner.tsx                                    — Toaster: theme-aware Sonner wrapper with custom icons
    ├── db/
    │   ├── schema.ts                                     — Drizzle table definitions (organizations, users, orgMembers, customers, invoices, invoiceLines)
    │   ├── relations.ts                                  — Drizzle relation graph for all 5 tables
    │   ├── columns.ts                                    — shared `timestamps` column group (createdAt, ms-precision)
    │   ├── cursor.ts                                     — Cursor type, cursorSchema, encodeCursor, decodeCursor
    │   ├── index.ts                                      — db singleton (drizzle/postgres-js, snake_case casing) + dbUnpooled alias
    │   └── queries/
    │       └── invoices.ts                               — listCustomers(organizationId) query
    └── lib/
        ├── utils.ts                                      — cn() class merge helper
        ├── result.ts                                     — Result<T> discriminated union + ok/err/isUniqueViolation helpers
        ├── auth-stub.ts                                  — getActiveContext() stub (resolves acme org + ada user by natural key)
        └── invoices/
            ├── schema.ts                                 — read-side Zod schemas: statusSchema, listInvoicesInputSchema
            ├── mutation-schemas.ts                       — write-side Zod schemas: create/update/delete input schemas (drizzle-zod)
            ├── queries.ts                                — listInvoices (cursor pagination), getInvoiceDetail (with customer + lines)
            └── actions.ts                                — Server Actions: createInvoice, updateInvoice, deleteInvoice
```

## Contracts

### `src/env.ts`
```ts
export const env: {
  DATABASE_URL: string;        // validated z.url()
  DATABASE_URL_UNPOOLED: string;
  SEED: number;                // default 1
}
```

### `src/lib/utils.ts`
```ts
export const cn = (...inputs: ClassValue[]) => string
```

### `src/lib/result.ts`
```ts
export type ErrorCode = 'validation' | 'conflict' | 'not_found' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'internal'

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; userMessage: string; fieldErrors?: Record<string, string[]> } }

export const ok = <T>(data: T): Result<T>
export const err = (code: ErrorCode, userMessage: string, fieldErrors?: Record<string, string[]>): Result<never>
export const isUniqueViolation = (e: unknown): boolean
```

### `src/lib/auth-stub.ts`
```ts
export const getActiveContext = async (): Promise<{ organizationId: string; userId: string }>
// resolves 'acme' org slug + 'ada@acme.test' user — stub replaced by authedAction in Ch 057
```

### `src/db/columns.ts`
```ts
export const timestamps = {
  createdAt: timestamp({ withTimezone: true, precision: 3 }).defaultNow().notNull()
}
```

### `src/db/cursor.ts`
```ts
export type Cursor = { createdAt: string; id: string }
export const cursorSchema: ZodObject<{ createdAt: ZodString; id: ZodUUID }>
export const encodeCursor = (c: Cursor): string   // → base64url token
export const decodeCursor = (token: string): Cursor | null  // returns null on malformed input
```

### `src/db/schema.ts`
Enums:
- `memberRole`: `'owner' | 'admin' | 'member'`
- `invoiceStatus`: `'draft' | 'sent' | 'paid' | 'overdue'`

Tables (all PKs are `uuid` defaulting to `uuidv7()`):

| Table | Key columns |
|-------|-------------|
| `organizations` | `id`, `name`, `slug` (unique), `createdAt` |
| `users` | `id`, `email` (unique), `name`, `createdAt` |
| `orgMembers` | PK `(organizationId, userId)`, `role`, `createdAt` |
| `customers` | `id`, `organizationId`, `name`, `email`, unique `(organizationId, email)`, `createdAt` |
| `invoices` | `id`, `organizationId`, `customerId`, `createdBy`, `number`, `status`, `total` (numeric 12,2), `currency`, `issuedAt`, `dueAt`, `createdAt`; unique `(organizationId, number)`; check `total >= 0`; indexes on `(org,status,createdAt,id)`, `(org,createdAt,id)`, `customerId` |
| `invoiceLines` | `id`, `invoiceId`, `description`, `quantity` (numeric 12,2), `unitPrice` (numeric 12,2), `position`, `createdAt`; unique `(invoiceId, position)` |

Exported types: `Organization`, `NewOrganization`, `User`, `NewUser`, `OrgMember`, `NewOrgMember`, `Customer`, `NewCustomer`, `Invoice`, `NewInvoice`, `InvoiceLine`, `NewInvoiceLine`

### `src/db/relations.ts`
Wires Drizzle relation graph: organizations ↔ members/customers/invoices; users ↔ members/invoices(createdByUser); orgMembers ↔ org/user; customers ↔ org/invoices; invoices ↔ org/customer/createdByUser/lines; invoiceLines ↔ invoice.

### `src/db/index.ts`
```ts
export const db: DrizzlePostgresJs   // snake_case casing, full schema+relations
export const dbUnpooled: typeof db   // alias for seed/migrate scripts
```

### `src/db/queries/invoices.ts`
```ts
export const listCustomers = async (organizationId: string): Promise<{ id: string; name: string }[]>
```

### `src/lib/invoices/schema.ts`
```ts
export const statusSchema: z.ZodEnum<['draft','sent','paid','overdue']>
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'

export const listInvoicesInputSchema   // { organizationId: uuid, status?, cursor?, pageSize: 1–100 default 20 }
export type ListInvoicesInput
```

### `src/lib/invoices/mutation-schemas.ts`
```ts
export const createInvoiceInputSchema   // drizzle-zod insert schema; omits organizationId/createdBy/createdAt; total: regex+refine string; dates coerced
export type CreateInvoiceInput          // z.input (raw form values)
export type CreateInvoiceOutput         // z.output (parsed/coerced)

export const updateInvoiceInputSchema   // createInvoiceInputSchema.extend({ id: z.uuid() })
export type UpdateInvoiceInput
export type UpdateInvoiceOutput

export const deleteInvoiceInputSchema   // z.object({ id: z.uuid() })
export type DeleteInvoiceInput
export type DeleteInvoiceOutput
```

### `src/lib/invoices/queries.ts`
```ts
export type InvoiceListRow   // invoices row with { customer: Customer } joined
export const listInvoices = async (input: ListInvoicesInput): Promise<{ rows: InvoiceListRow[]; nextCursor: string | null }>
// cursor-paginated, ordered by (createdAt desc, id desc), pageSize+1 probe

export type InvoiceDetail    // invoices row with { customer, lines: InvoiceLine[] }
export const getInvoiceDetail = async (args: { organizationId: string; invoiceId: string }): Promise<InvoiceDetail | null>
// tenant-guarded: AND(id, organizationId) in where
```

### `src/lib/invoices/actions.ts`
All are `'use server'` Server Actions with signature `(prevState, formData) => Promise<Result<...>>`:

```ts
export const createInvoice: (_prevState: Result<{ id: string }> | null, formData: FormData) => Promise<Result<{ id: string }>>
// parse → err(validation) | getActiveContext | insert | isUniqueViolation → conflict | redirect(/invoices/:id)

export const updateInvoice: (_prevState: Result<{ id: string }> | null, formData: FormData) => Promise<Result<{ id: string }>>
// parse → err(validation) | db.update WHERE AND(id, orgId) | revalidatePath | ok({id})

export const deleteInvoice: (_prevState: Result<null> | null, formData: FormData) => Promise<Result<null>>
// parse → err(validation) | db.transaction(findFirst → delete lines → delete invoice) | revalidatePath | redirect(/invoices?deleted=number)
```

### `src/app/_components/providers.tsx`
```ts
export const Providers: ({ children }: { children: ReactNode }) => JSX.Element
// ThemeProvider (next-themes), attribute="class", defaultTheme="system"
```

### `src/app/_components/submit-button.tsx`
```ts
export const SubmitButton: ({ children, variant }: { children: ReactNode; variant?: ButtonVariant }) => JSX.Element
// useFormStatus() → disabled+Loader2 spinner when pending
```

### `src/app/_components/field-error.tsx`
```ts
export const FieldError: ({ name, fieldErrors }: { name: string; fieldErrors: Record<string, string[]> | undefined }) => JSX.Element | null
// renders <p id={name-error} role=alert> with first error message, or null
```

### `src/app/invoices/_components/optimistic-invoices-list.tsx`
```ts
export type OptimisticInvoice = { id: string; number: string; status: InvoiceStatus; total: string; customerName: string; dueAt: Date | null; pending: true }
export type ListItem = InvoiceListRow | OptimisticInvoice

export const useAddOptimisticInvoice: () => { addOptimistic: (invoice: OptimisticInvoice) => void; inline: boolean }
// context default: { addOptimistic: () => {}, inline: false }

export const OptimisticInvoicesList: ({ initialInvoices, customers }: { initialInvoices: InvoiceListRow[]; customers: { id: string; name: string }[] }) => JSX.Element
// useOptimistic prepends pending rows; exposes AddOptimisticInvoiceContext with inline:true
```

### `src/app/invoices/_components/deleted-toast.tsx`
```ts
export const DeletedToast: ({ number }: { number: string }) => null
// useEffect fires toast.success(`Invoice ${number} deleted`) once on mount
```

### `src/app/invoices/new/new-invoice-form.tsx`
```ts
export const NewInvoiceForm: ({ customers }: { customers: { id: string; name: string }[] }) => JSX.Element
// useActionState(createInvoice, null); inline=true → optimistic startTransition + uuidv7 tempId hidden input + h2 heading; standalone → direct action (PE) + onSubmit echo; echoed defaults + key=submitCount remount on submit; _debug_fail checkbox
```

### `src/app/invoices/[invoiceId]/edit-invoice-form.tsx`
```ts
export const EditInvoiceForm: ({ invoice, customers }: { invoice: InvoiceDetail; customers: { id: string; name: string }[] }) => JSX.Element
// useActionState(updateInvoice, null); hidden id input; echoed defaults + key=submitCount remount on submit
```

### `src/app/invoices/[invoiceId]/delete-invoice-form.tsx`
```ts
export const DeleteInvoiceForm: ({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) => JSX.Element
// useActionState(deleteInvoice, null); Radix Dialog (trigger + confirm form) + inline no-JS fallback form
```

### UI components (`src/components/ui/`)
```ts
// button.tsx
export const buttonVariants: CVA  // variants: default/destructive/outline/secondary/ghost/link; sizes: default/xs/sm/lg/icon/*
export function Button(props: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }): JSX.Element

// badge.tsx
export const badgeVariants: CVA
export function Badge(props: ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }): JSX.Element

// card.tsx
export { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter }

// dialog.tsx
export { Dialog, DialogTrigger, DialogPortal, DialogOverlay, DialogClose, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription }

// input.tsx
export function Input(props: ComponentProps<'input'>): JSX.Element

// label.tsx
export function Label(props: ComponentProps<typeof LabelPrimitive.Root>): JSX.Element

// native-select.tsx
export function NativeSelect(props: Omit<ComponentProps<'select'>, 'size'> & { size?: 'sm' | 'default' }): JSX.Element
export function NativeSelectOption(props: ComponentProps<'option'>): JSX.Element
export function NativeSelectOptGroup(props: ComponentProps<'optgroup'>): JSX.Element

// separator.tsx
export function Separator(props: ComponentProps<typeof SeparatorPrimitive.Root>): JSX.Element

// skeleton.tsx
export function Skeleton(props: ComponentProps<'div'>): JSX.Element

// sonner.tsx
export const Toaster: (props: ToasterProps) => JSX.Element  // theme-aware, custom lucide icons
```

### `scripts/seed.ts`
```ts
export const runSeed = async (): Promise<void>
// reset() → insert 2 orgs + 4 users + 5 memberships + 40 customers + ~600 invoices + lines
// LCG PRNG seeded from env.SEED; deterministic across runs
```

### `next.config.ts` (verbatim)
```ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  typedRoutes: true,
  reactCompiler: true,
  turbopack: { root: __dirname },
};
```

## Dependencies

### Production
| Package | Version |
|---------|---------|
| `next` | 16.2.7 |
| `react` | 19.2.4 |
| `react-dom` | 19.2.4 |
| `drizzle-orm` | ^0.45.1 |
| `postgres` | ^3.4.7 |
| `zod` | ^4.4.3 |
| `@t3-oss/env-nextjs` | ^0.13.11 |
| `next-themes` | ^0.4.6 |
| `radix-ui` | ^1.4.3 |
| `sonner` | ^2.0.7 |
| `lucide-react` | ^1.17.0 |
| `class-variance-authority` | ^0.7.1 |
| `clsx` | ^2.1.1 |
| `tailwind-merge` | ^3.6.0 |
| `tw-animate-css` | ^1.4.0 |
| `uuidv7` | ^1.0.2 |

### Development
| Package | Version |
|---------|---------|
| `typescript` | ^6.0.3 |
| `@biomejs/biome` | 2.4.16 |
| `drizzle-kit` | ^0.31.5 |
| `drizzle-seed` | ^0.3.1 |
| `drizzle-zod` | ^0.8.0 |
| `vitest` | ^4.1.8 |
| `tailwindcss` | ^4.3.0 |
| `@tailwindcss/postcss` | ^4.3.0 |
| `babel-plugin-react-compiler` | 1.0.0 |
| `tsx` | ^4.20.0 |
| `dotenv-cli` | ^10.0.0 |
| `@types/node` | ^25.9.1 |
| `@types/react` | ^19.2.16 |
| `@types/react-dom` | ^19.2.3 |

## Start diff

The `start/` directory contains the same file tree as `solution/` with these differences:

### Files with TODOs (student implementation targets)

**`src/app/_components/submit-button.tsx`** — TODO(L2)
- Start: stub renders `<Button type="submit">` without pending state
- Solution: adds `useFormStatus()`, disables button and shows `<Loader2>` spinner when `pending`
- TODO text: `useFormStatus(); shadcn Button type=submit disabled={pending}; Loader2 spinner with motion-reduce:animate-none.`

**`src/app/_components/field-error.tsx`** — TODO(L2)
- Start: stub always returns `null` (props typed but ignored)
- Solution: renders `<p id={name-error} role="alert" className="text-destructive">` with first error message
- TODO text: `render <p id={name-error} role=alert class=text-destructive> from fieldErrors?.[name]?.[0], else null.`

**`src/lib/invoices/mutation-schemas.ts`** — TODOs(L2, L3, L4)
- Start: all three schemas are empty `z.object({})`
- Solution: `createInvoiceInputSchema` uses `createInsertSchema(invoices, {...overrides}).omit({...})` with number/total/date/uuid refinements; `updateInvoiceInputSchema` extends with `id`; `deleteInvoiceInputSchema` is `z.object({ id: z.uuid() })`
- TODO texts map to lessons L2 (create), L3 (update), L4 (delete)

**`src/lib/invoices/actions.ts`** — TODOs(L2, L3, L4)
- Start: all three actions return `err('internal', 'Not implemented')`
- Solution: fully implemented with parse → context → db op → error handling → revalidatePath → redirect
- Notable additions: L6 wraps `deleteInvoice` in `db.transaction` and appends `?deleted=number` to the redirect URL

**`src/app/invoices/new/new-invoice-form.tsx`** — TODO(L2, L5)
- Start: renders empty `<form>` with just an `<h2>` heading
- Solution: full field cluster (customer/number/status/total/issuedAt/dueAt/currency), `useActionState`, `FieldError`, `SubmitButton`, echoed defaults, submit-count remount key, optimistic context integration (`useAddOptimisticInvoice`/`startTransition`/`uuidv7` tempId hidden input), `_debug_fail` checkbox

**`src/app/invoices/[invoiceId]/edit-invoice-form.tsx`** — TODO(L3)
- Start: renders empty `<form>` with just an `<h2>` heading
- Solution: mirrors new-invoice-form fields with `defaultValue` seeded from `invoice` prop, `useActionState(updateInvoice)`, hidden `id` input, echoed defaults + remount key

**`src/app/invoices/[invoiceId]/delete-invoice-form.tsx`** — TODO(L4)
- Start: renders Delete button stub with no form or action
- Solution: `useActionState(deleteInvoice)`, Radix `Dialog` with confirm form + `Cancel` + destructive `SubmitButton`, plus a `data-testid="delete-fallback-form"` no-JS fallback form below the dialog

**`src/app/invoices/_components/optimistic-invoices-list.tsx`** — TODO(L5)
- Start: no `useOptimistic`, iterates `initialInvoices` directly; context exposes only `addOptimistic` function (no `inline` flag)
- Solution: adds `useOptimistic(initialInvoices, prepend)`, renders pending rows with dimmed opacity + spinner, renames context shape to `{ addOptimistic, inline }` (the `inline` flag controls heading ownership and the optimistic transition path in `NewInvoiceForm`)

### Files identical between start and solution
All files not listed above are byte-for-byte identical: `src/db/`, `src/lib/invoices/schema.ts`, `src/lib/invoices/queries.ts`, `src/lib/result.ts`, `src/lib/auth-stub.ts`, `src/lib/utils.ts`, `src/env.ts`, all page/layout RSCs, all UI components, config files, scripts, and tests.
