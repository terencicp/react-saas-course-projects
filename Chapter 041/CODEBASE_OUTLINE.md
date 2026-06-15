# Chapter 041 — Codebase Summary

## Solution file tree

```
projects/Chapter 041/solution/
├── package.json                                 — project manifest, scripts, dependencies
├── next.config.ts                               — Next.js config (cacheComponents, typedRoutes, reactCompiler, turbopack)
├── tsconfig.json                                — TypeScript strict config, path alias @/*
├── biome.json                                   — Biome formatter/linter config
├── vitest.config.ts                             — Vitest config (node env, tests/lessons/**/*.test.ts)
├── drizzle.config.ts                            — Drizzle Kit config (postgresql, snake_case, ./drizzle out)
├── docker-compose.yml                           — Postgres 18 service on port 5432
├── .env.example                                 — sample env vars (DATABASE_URL, DATABASE_URL_UNPOOLED, SEED)
├── AGENTS.md                                    — project overview and daily commands for agents
├── scripts/
│   ├── seed.ts                                  — deterministic, idempotent seed (runSeed export + CLI entry)
│   └── test-lesson.mjs                          — CLI runner: executes one Lesson <n>.test.ts via vitest
├── drizzle/
│   └── 0000_init_schema.sql                     — generated init migration (enums + 6 tables)
├── tests/lessons/
│   ├── Lesson 2.test.ts                         — placeholder (describe.todo)
│   ├── Lesson 3.test.ts                         — placeholder (describe.todo)
│   ├── Lesson 4.test.ts                         — placeholder (describe.todo)
│   ├── Lesson 5.test.ts                         — placeholder (describe.todo)
│   └── Lesson 6.test.ts                         — placeholder (describe.todo)
└── src/
    ├── env.ts                                   — @t3-oss/env-nextjs boundary (DATABASE_URL, DATABASE_URL_UNPOOLED, SEED)
    ├── app/
    │   ├── globals.css                          — Tailwind v4 CSS-first theme, light/dark CSS vars (oklch)
    │   ├── layout.tsx                           — Root layout: html/body + Providers, metadata export
    │   ├── page.tsx                             — Root page: redirects to /inspector
    │   ├── _components/
    │   │   └── providers.tsx                    — 'use client' ThemeProvider (next-themes) wrapper
    │   └── inspector/
    │       ├── page.tsx                         — Inspector RSC: parses searchParams, renders four panels
    │       ├── loading.tsx                      — Suspense boundary shell for Partial Prerender
    │       ├── actions.ts                       — 'use server' reseed action wrapping runSeed
    │       └── _components/
    │           ├── counts-banner.tsx            — async RSC: renders six table row counts
    │           ├── inspector-header.tsx         — org switcher + status filter nav + reseed form
    │           ├── list-panel.tsx               — async RSC: paginated invoice list with cursor link
    │           ├── detail-panel.tsx             — async RSC: invoice detail + line items
    │           └── plan-panel.tsx               — async RSC: EXPLAIN ANALYZE output in <details>
    ├── components/ui/
    │   ├── badge.tsx                            — shadcn Badge component
    │   ├── button.tsx                           — shadcn Button component
    │   ├── card.tsx                             — shadcn Card component
    │   ├── separator.tsx                        — shadcn Separator component
    │   └── skeleton.tsx                         — shadcn Skeleton component
    ├── db/
    │   ├── index.ts                             — drizzle client (postgres-js driver, snake_case casing, Relations v1)
    │   ├── schema.ts                            — six Drizzle tables: single source of truth
    │   ├── relations.ts                         — Relations v1 declarations for all six tables
    │   ├── columns.ts                           — reusable timestamps column group (createdAt, precision:3)
    │   └── cursor.ts                            — opaque cursor helpers (Cursor type, encode/decode)
    └── lib/
        ├── utils.ts                             — cn() utility (clsx + tailwind-merge)
        └── invoices/
            ├── schema.ts                        — read-boundary Zod schemas (statusSchema, listInvoicesInputSchema)
            ├── queries.ts                       — two tenant-scoped reads: listInvoices + getInvoiceDetail
            ├── counts.ts                        — getRowCounts + listOrgs (provided inspector plumbing)
            └── explain.ts                       — provided EXPLAIN ANALYZE probes (getDetailPlan, getListPlan)
```

## Contracts

### `src/env.ts`
```ts
export const env: {
  DATABASE_URL: string;          // z.url()
  DATABASE_URL_UNPOOLED: string; // z.url()
  SEED: number;                  // z.coerce.number().default(1)
}
```

### `src/db/columns.ts`
```ts
export const timestamps: {
  createdAt: PgTimestampBuilder  // withTimezone:true, precision:3, defaultNow, notNull
}
```

### `src/db/schema.ts`

Enums:
```ts
export const memberRole    = pgEnum('member_role',    ['owner', 'admin', 'member'])
export const invoiceStatus = pgEnum('invoice_status', ['draft', 'sent', 'paid', 'overdue'])
```

Tables (all PKs: `uuid, uuidv7() default`; all carry `...timestamps`):

| Table | Key columns | Constraints |
|---|---|---|
| `organizations` | id, name, slug | `organizations_slug_unique` |
| `users` | id, email, name | `users_email_unique` |
| `orgMembers` | organizationId→orgs, userId→users, role:memberRole | composite PK (orgId, userId) |
| `customers` | id, organizationId→orgs, name, email | `customers_org_email_unique(orgId, email)` |
| `invoices` | id, organizationId→orgs, customerId→customers (restrict), createdBy→users (restrict), number, status:invoiceStatus (default 'draft'), total:numeric(12,2), currency (default 'USD'), issuedAt, dueAt | `invoices_org_number_unique`; check `total >= 0`; 3 indexes: `idx_invoices_org_status_created_at_id(orgId,status,createdAt desc,id desc)`, `idx_invoices_org_created_at_id(orgId,createdAt desc,id desc)`, `idx_invoices_customer_id(customerId)` |
| `invoiceLines` | id, invoiceId→invoices (cascade), description, quantity:numeric(12,2), unitPrice:numeric(12,2), position:integer | `invoice_lines_invoice_position_unique(invoiceId, position)` |

Inferred types exported: `Organization`, `NewOrganization`, `User`, `NewUser`, `OrgMember`, `NewOrgMember`, `Customer`, `NewCustomer`, `Invoice`, `NewInvoice`, `InvoiceLine`, `NewInvoiceLine`

### `src/db/relations.ts`
```ts
export const organizationsRelations  // has many: members, customers, invoices
export const usersRelations           // has many: members, invoices (relationName:'createdByUser')
export const orgMembersRelations      // belongs to: organization, user
export const customersRelations       // belongs to: organization; has many: invoices
export const invoicesRelations        // belongs to: organization, customer, createdByUser; has many: lines
export const invoiceLinesRelations    // belongs to: invoice
```

### `src/db/index.ts`
```ts
export const db: DrizzlePostgresDatabase   // postgres-js driver, casing:'snake_case', Relations v1 schema
export const dbUnpooled: typeof db         // alias for seed/migrate code (pooled/unpooled split is local no-op)
```

### `src/db/cursor.ts`
```ts
export type Cursor = { createdAt: string; id: string }
export const cursorSchema: ZodObject<{ createdAt: z.ZodString; id: z.ZodUUID }>
export const encodeCursor = (c: Cursor): string        // base64url-encodes JSON
export const decodeCursor = (token: string): Cursor | null  // decode+validate; returns null on bad token
```

### `src/lib/invoices/schema.ts`
```ts
export const statusSchema = z.enum(['draft', 'sent', 'paid', 'overdue'])
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'
export const listInvoicesInputSchema = z.object({
  organizationId: z.uuid(),
  status: statusSchema.optional(),
  cursor: cursorSchema.optional(),
  pageSize: z.number().int().min(1).max(100).default(20),
})
export type ListInvoicesInput = z.infer<typeof listInvoicesInputSchema>
```

### `src/lib/invoices/queries.ts`
```ts
export type InvoiceListRow   // inferred from db.query.invoices.findMany with { customer: true }
export type InvoiceDetail    // NonNullable<Awaited<ReturnType<findFirst>>> with customer + lines

export const listInvoices = async (
  input: ListInvoicesInput
): Promise<{ rows: InvoiceListRow[]; nextCursor: string | null }>
// compound cursor predicate: (createdAt < cursor.createdAt) OR (createdAt = cursor.createdAt AND id < cursor.id)
// fetches pageSize+1; slices to pageSize; emits encodeCursor from last kept row

export const getInvoiceDetail = async (args: {
  organizationId: string;
  invoiceId: string;
}): Promise<InvoiceDetail | null>
// tenant-guarded findFirst: AND(id = invoiceId, orgId = organizationId); with customer + lines orderBy position asc
```

### `src/lib/invoices/counts.ts`
```ts
export const getRowCounts = async (): Promise<{
  organizations: number; users: number; orgMembers: number;
  customers: number; invoices: number; invoiceLines: number;
}>  // parallel Promise.all of six count(*) selects

export const listOrgs = async (): Promise<{ id: string; name: string }[]>
// db.select({id, name}).from(organizations).orderBy(name)
```

### `src/lib/invoices/explain.ts`
```ts
export const getDetailPlan = async (args: {
  organizationId: string; invoiceId: string
}): Promise<string>  // EXPLAIN ANALYZE BUFFERS on the detail join query

export const getListPlan = async (args: {
  organizationId: string; status?: string
}): Promise<string>  // EXPLAIN ANALYZE BUFFERS on the list query (optional status cast)
```

### `src/app/inspector/actions.ts`
```ts
// 'use server'
export const reseed = async (): Promise<void>
// calls runSeed() then revalidatePath('/inspector')
```

### `src/app/inspector/page.tsx`
```ts
// async RSC, PageProps<'/inspector'>
// searchParams: orgId, status, cursor, invoiceId
// Renders: <CountsBanner/> <InspectorHeader/> <ListPanel/> <DetailPanel/> <PlanPanel/>
export default InspectorPage
```

### `src/app/inspector/_components/counts-banner.tsx`
```ts
export const CountsBanner: () => Promise<JSX.Element>
// calls getRowCounts(); renders 6 stat cells with data-testid="count-*"
```

### `src/app/inspector/_components/inspector-header.tsx`
```ts
type InspectorHeaderProps = {
  orgs: { id: string; name: string }[];
  activeOrgId: string;
  activeStatus: InvoiceStatus | undefined;
}
export const InspectorHeader: (props: InspectorHeaderProps) => JSX.Element
// org switcher nav + status filter nav (Link per status) + reseed <form action={reseed}>
const statusHref = (orgId: string, status: 'all' | InvoiceStatus): `/inspector?${string}`
```

### `src/app/inspector/_components/list-panel.tsx`
```ts
type ListPanelProps = {
  organizationId: string;
  status: InvoiceStatus | undefined;
  cursor: Cursor | undefined;
}
export const ListPanel: (props: ListPanelProps) => Promise<JSX.Element>
// calls listInvoices({...props, pageSize:20}); renders invoice rows + "Next page" cursor link
const STATUS_VARIANT: Record<InvoiceStatus, 'default'|'secondary'|'outline'|'destructive'>
```

### `src/app/inspector/_components/detail-panel.tsx`
```ts
type DetailPanelProps = { organizationId: string; invoiceId: string | undefined }
export const DetailPanel: (props: DetailPanelProps) => Promise<JSX.Element>
// calls getInvoiceDetail when invoiceId present; renders invoice metadata + line items table
```

### `src/app/inspector/_components/plan-panel.tsx`
```ts
type PlanPanelProps = {
  organizationId: string;
  status: InvoiceStatus | undefined;
  invoiceId: string | undefined;
}
export const PlanPanel: (props: PlanPanelProps) => Promise<JSX.Element>
// calls getDetailPlan or getListPlan; renders plan text in <details><pre data-testid="plan-text">
```

### `src/app/layout.tsx`
```ts
export const metadata: Metadata = { title: 'Invoicing data layer', description: '...' }
export default RootLayout: ({ children: ReactNode }) => JSX.Element
```

### `src/app/page.tsx`
```ts
export default Home  // redirect('/inspector')
```

### `src/app/_components/providers.tsx`
```ts
// 'use client'
export const Providers: ({ children: ReactNode }) => JSX.Element
// ThemeProvider: attribute="class", defaultTheme="system", enableSystem, disableTransitionOnChange
```

### `src/lib/utils.ts`
```ts
export const cn: (...inputs: ClassValue[]) => string  // clsx + twMerge
```

### `scripts/seed.ts`
```ts
export const runSeed = async (): Promise<void>
// 1. reset(dbUnpooled, schema)
// 2. Insert 2 orgs (Acme, Globex), 4 users, 5 orgMembers (Ada in both orgs)
// 3. Insert 40 customers (alternating orgs), 12-18 invoices each, 2-4 lines each
// 4. All randomness via a seeded LCG PRNG (env.SEED); PKs from schema uuidv7() default
// CLI entry via pathToFileURL guard
```

Constants: `CUSTOMER_COUNT = 40`, `SEED_EPOCH = Date.UTC(2025, 0, 1)`, `STATUS_BANDS` (paid:50, sent:25, draft:15, overdue:10)

### `drizzle.config.ts`
```ts
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED! },
  casing: 'snake_case',
  verbose: true,
  strict: true,
})
```

### `next.config.ts`
```ts
export default {
  cacheComponents: true,
  typedRoutes: true,
  reactCompiler: true,
  turbopack: { root: __dirname },
}
```

### `vitest.config.ts`
```ts
// environment: 'node', globals: false, include: ['tests/lessons/**/*.test.ts'], tsconfigPaths: true
```

---

## Dependencies

### dependencies
| Package | Version |
|---|---|
| `@t3-oss/env-nextjs` | ^0.13.11 |
| `class-variance-authority` | ^0.7.1 |
| `clsx` | ^2.1.1 |
| `drizzle-orm` | ^0.45.1 |
| `lucide-react` | ^1.17.0 |
| `next` | 16.2.7 |
| `next-themes` | ^0.4.6 |
| `postgres` | ^3.4.7 |
| `radix-ui` | ^1.4.3 |
| `react` | 19.2.4 |
| `react-dom` | 19.2.4 |
| `tailwind-merge` | ^3.6.0 |
| `tw-animate-css` | ^1.4.0 |
| `uuidv7` | ^1.0.2 |
| `zod` | ^4.4.3 |

### devDependencies
| Package | Version |
|---|---|
| `@biomejs/biome` | 2.4.16 |
| `@tailwindcss/postcss` | ^4.3.0 |
| `@types/node` | ^25.9.1 |
| `@types/react` | ^19.2.16 |
| `@types/react-dom` | ^19.2.3 |
| `babel-plugin-react-compiler` | 1.0.0 |
| `dotenv-cli` | ^10.0.0 |
| `drizzle-kit` | ^0.31.5 |
| `drizzle-seed` | ^0.3.1 |
| `tailwindcss` | ^4.3.0 |
| `tsx` | ^4.20.0 |
| `typescript` | ^6.0.3 |
| `vitest` | ^4.1.8 |

---

## Start diff

The start and solution directories are structurally identical in file layout. All infrastructure (inspector UI components, EXPLAIN probes, counts/orgs helpers, cursor helpers, lib/invoices/schema.ts, env.ts, db/index.ts, db/columns.ts, actions.ts, inspector page, layout, tests) is pre-filled and identical. The student-facing differences are:

### `src/db/schema.ts` — TODO(L3)
The start file has the six tables present but incomplete:
- `organizations.slug` has no `.unique()` constraint.
- `users.email` has no `.unique()` constraint.
- `orgMembers` has no `.references()` on either FK, no composite `primaryKey`, and `role` is `text()` instead of `memberRole()`.
- `customers` has no `.references()` on `organizationId` and no `unique('customers_org_email_unique').on(orgId, email)`.
- `invoices` has no `.references()` on any FK, `status` is `text()` instead of `invoiceStatus()`, `currency` has no default, no `unique`, no `check`, and no indexes.
- `invoiceLines` has no `.references()` and no composite unique on `(invoiceId, position)`.
- The `memberRole` and `invoiceStatus` pgEnums are not declared.
- The top-level TODO comment reads: `// TODO(L3) — author the six tables...`

### `src/db/relations.ts` — TODO(L3)
All six `*Relations` consts are stubs returning empty `({})`. The TODO at the top reads: `// TODO(L3) — declare Relations v1 per table: organization↦(...), invoice↦(...), etc.`

### `scripts/seed.ts` — TODO(L4)
`runSeed` body is a single `await reset(dbUnpooled, schema)` with no insert logic. The TODO reads: `// TODO(L4) — reset(dbUnpooled, schema) then direct-insert 2 orgs / 4 users / 5 org_members ... deterministic via a SEED-driven PRNG...`. The `NewCustomer`, `NewInvoice`, `NewInvoiceLine`, `NewOrgMember` imports and all PRNG/data constants are absent. Also the `env` import and all the typed insert code are absent.

### `src/lib/invoices/queries.ts` — TODO(L5), TODO(L6)
Both query functions are stubs returning empty data:
- `listInvoices` returns `{ rows: [], nextCursor: null }` with TODO: `// TODO(L5) — listInvoices: db.query.invoices.findMany with tenant+status+cursor where (callback), orderBy desc(createdAt,id), limit pageSize+1, with:{customer}; slice probe → {rows, nextCursor}.`
- `getInvoiceDetail` returns `null` with TODO: `// TODO(L6) — getInvoiceDetail: db.query.invoices.findFirst, where AND-includes id AND organizationId, with:{customer, lines orderBy position}; return result ?? null.`
- `InvoiceListRow` and `InvoiceDetail` are hand-typed structural aliases (not inferred from the ORM) as placeholders to keep the inspector compilable.

### `drizzle/` directory
Absent in start (no migration generated yet — the student runs `pnpm db:generate` as part of the exercise).

### TODO summary
| File | TODO label | What to implement |
|---|---|---|
| `src/db/schema.ts` | L3 | Enums, FK references with onDelete, composite PK, unique constraints, check constraint, three indexes |
| `src/db/relations.ts` | L3 | All six Relations v1 declarations |
| `scripts/seed.ts` | L4 | Full deterministic seed (PRNG, orgs/users/members/customers/invoices/lines) |
| `src/lib/invoices/queries.ts` | L5 | `listInvoices` with compound cursor predicate |
| `src/lib/invoices/queries.ts` | L6 | `getInvoiceDetail` with tenant guard and nested with |
