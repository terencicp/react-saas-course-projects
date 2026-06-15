# Chapter 079 — Codebase Summary

## Solution file tree

```
src/
  app/
    layout.tsx                                          Root layout: NuqsAdapter, ThemeProvider, nav links, Toaster
    page.tsx                                            Redirects / → /customers
    globals.css                                         Tailwind base styles
    _components/
      providers.tsx                                     Client ThemeProvider wrapper
    (app)/
      customers/
        page.tsx                                        RSC: lists customers (session + search params → listCustomers)
        loading.tsx                                     Skeleton list placeholder
        toolbar.tsx                                     Client search input, debounced nuqs state write
        table.tsx                                       Customer rows table with links to detail
        pagination.tsx                                  Client keyset pagination via nuqs cursor param
        [id]/
          page.tsx                                      RSC: customer detail page (getCustomerDetail or notFound)
          loading.tsx                                   Skeleton detail placeholder
        new/
          layout.tsx                                    Async RSC: reads debug flags, mounts WizardStoreProvider + progress + footer
          wizard-progress.tsx                           Client: step pip header, reads currentStep + completedSteps
          footer.tsx                                    Client: Back/Next buttons, reads selectIsStepValid + goNext/goBack
          step-1/
            page.tsx                                    Client: Contact step — four atomic field components (FirstNameField etc.)
          step-2/
            page.tsx                                    Client: Billing step — eight atomic field components
          step-3/
            page.tsx                                    Client: Preferences step — currency/language selects + channels checkboxes
          step-4/
            page.tsx                                    Client: Review step — useShallow pick of all three slices
            submit-button.tsx                           Client: useTransition guard, calls createCustomer, reset + redirect on success
          _lib/
            wizard/
              wizard-types.ts                           Types: ContactSlice, BillingSlice, PreferencesSlice, MetaSlice, WizardState, WizardStore, initialWizardData
              schemas.ts                                Zod schemas: contactSchema, billingSchema, preferencesSchema, createCustomerInput
              store.ts                                  createWizardStore() via zustand/vanilla createStore; composeSlices + reset
              contact-slice.ts                          createContactSlice StateCreator
              billing-slice.ts                          createBillingSlice StateCreator
              preferences-slice.ts                      createPreferencesSlice StateCreator (with togglePreferenceChannel)
              meta-slice.ts                             createMetaSlice StateCreator (goNext pushes to completedSteps, goBack clamps to 1)
              selectors.ts                              selectCurrentStep, selectContactFirstName/LastName/Email/Phone, selectIsStepValid, selectStepErrors
              actions.ts                                'use server' createCustomer via authedInputAction; conflict on code 23505
          _components/
            wizard-store-provider.tsx                   Client: WizardStoreContext + WizardStoreProvider (useRef-pinned, debug flags support)
            use-wizard-store.ts                         Client: useWizardStore<T>(selector) hook — reads from context
            use-broadcast-snapshot.ts                   Client: postMessages store snapshot to parent window; handles inbound reset/submit control
            use-broadcast-render.ts                     Client: postMessages field render events to parent window on every commit
    inspector/
      page.tsx                                          RSC: inspector dashboard (counts, identity switcher, live wizard, debug flags, audit tail)
      inspector-panel.tsx                               Client: iframe wizard bridge + store snapshot display + re-render counter
      actions.ts                                        'use server': switchIdentity, resetAndReseed, armForceFailureForActor, toggleDebugFlag
      loading.tsx                                       Skeleton inspector placeholder
  lib/
    utils.ts                                            cn() utility (clsx + tailwind-merge)
    result.ts                                           Result<T> type, ok(), err(), conflict() helpers
    authed-action.ts                                    authedAction (FormData shape) + authedInputAction (direct object shape)
    audit-log.ts                                        logAudit() thin wrapper over store pushAudit
    force-failure.ts                                    armForceFailure / consumeForceFailure (globalThis-backed Set)
    debug-flags.ts                                      DebugFlag type, readDebugFlags, setDebugFlag (cookie-backed, server-only)
    customers/
      queries.ts                                        listCustomers (keyset, search), getCustomerDetail (server-only)
      search-params.ts                                  nuqs customerListSearchParams + customerListSearchParamsCache
  server/
    types.ts                                            InvoiceStatus, Role, roleAtLeast, Invoice, AuditLog, Customer types
    session.ts                                          getSession, setActingIdentity (cookie-backed dev session, no auth wall)
    store.ts                                            In-memory globalThis-pinned AppStore: users, invoices, auditLogs, customers; reseed, pushAudit, pushCustomer, findInvoice, findCustomer
  components/
    ui/                                                 shadcn/ui primitives: button, card, badge, checkbox, dialog, dropdown-menu, input, label, select, separator, skeleton, sonner
```

---

## Contracts

### `src/server/types.ts`
```ts
type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'
type Role = 'owner' | 'admin' | 'member'
const roleAtLeast = (role: Role, required: Role): boolean
type Invoice = { id, orgId, number, customerName, status, total, currency, createdAt, dueAt, deletedAt, archivedAt, version }
type AuditLog = { id, orgId, actorUserId, action, subjectId, createdAt }
type Customer = { id, orgId, firstName, lastName, email, phone, line1, line2, city, region, postalCode, country, taxId, paymentTerms, defaultCurrency, language, notificationChannels: string[], createdAt }
```

### `src/server/session.ts`
```ts
type Session = { userId: string; orgId: string; role: Role }
const getSession = async (): Promise<Session>
const setActingIdentity = async (value: string): Promise<void>  // 'use server'
// Cookie: 'acting-identity', default 'org-acme:admin'
```

### `src/server/store.ts`
```ts
type StoreUser = { id: string; orgId: string; role: Role }
// Exports (mutable refs on globalThis.__appStore):
export const users: StoreUser[]
export const invoices: Invoice[]
export const auditLogs: AuditLog[]
export const customers: Customer[]
export const reseed = (): void
export const findInvoice = (orgId: string, id: string): Invoice | undefined
export const findCustomer = (orgId: string, id: string): Customer | undefined
export const pushAudit = (entry: Omit<AuditLog, 'id' | 'createdAt'>): void
export const pushCustomer = (entry: Omit<Customer, 'id' | 'createdAt'>): Customer
// pushCustomer throws { code: '23505' } on duplicate (orgId, email)
```

### `src/lib/result.ts`
```ts
type ErrorCode = 'validation' | 'conflict' | 'not_found' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'internal'
type Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; userMessage: string; fieldErrors?: Record<string, string[]>; current?: unknown } }
const ok = <T>(data: T): Result<T>
const err = (code: ErrorCode, userMessage: string, fieldErrors?: Record<string, string[]>): Result<never>
const conflict = <T>(userMessage: string, current: T): Result<never>
```

### `src/lib/authed-action.ts`
```ts
type AuthedCtx = { session: Session; orgId: string; userId: string; role: Role }
// FormData-bound action (use with useActionState):
const authedAction = <TSchema, TOut>(role: Role, schema: TSchema, fn: (input, ctx: AuthedCtx) => Promise<Result<TOut>>) => async (_prev: Result<TOut> | null, formData: FormData) => Promise<Result<TOut>>
// Direct-object action (call with await inside transition):
const authedInputAction = <TSchema, TOut>(role: Role, schema: TSchema, fn: (input, ctx: AuthedCtx) => Promise<Result<TOut>>) => async (input: z.infer<TSchema>) => Promise<Result<TOut>>
```

### `src/lib/audit-log.ts`
```ts
const logAudit = (entry: { orgId: string; actorUserId: string; action: string; subjectId: string }): void
```

### `src/lib/force-failure.ts`
```ts
const armForceFailure = (userId: string): void
const consumeForceFailure = (userId: string): boolean  // read-and-clear
```

### `src/lib/debug-flags.ts`
```ts
type DebugFlag = 'STORE_MODULE_SCOPED' | 'PROVIDER_ON_STEP_PAGE'
const DEBUG_FLAGS: DebugFlag[]
const readDebugFlags = async (): Promise<Record<DebugFlag, boolean>>
const setDebugFlag = async (flag: DebugFlag, on: boolean): Promise<void>  // 'use server'
// Cookie: debug-STORE_MODULE_SCOPED, debug-PROVIDER_ON_STEP_PAGE
```

### `src/lib/customers/queries.ts`
```ts
type ListCustomersArgs = { orgId: string; q?: string; cursor?: string | null; pageSize?: number }
type ListCustomersResult = { rows: Customer[]; nextCursor: string | null }
const listCustomers = (args: ListCustomersArgs): ListCustomersResult
type GetCustomerDetailArgs = { orgId: string; id: string }
const getCustomerDetail = (args: GetCustomerDetailArgs): Customer | null
```

### `src/lib/customers/search-params.ts`
```ts
const customerListSearchParams = { q: parseAsString.withDefault(''), cursor: parseAsString }
const customerListSearchParamsCache  // nuqs server cache
```

### `src/app/(app)/customers/new/_lib/wizard/wizard-types.ts`
```ts
type ContactSlice = { contact: { firstName, lastName, email, phone }; setContactField<K>(key, value): void }
type BillingSlice = { billing: { line1, line2, city, region, postalCode, country, taxId, paymentTerms: 'net15'|'net30'|'net60' }; setBillingField<K>(key, value): void }
type PreferencesSlice = { preferences: { channels: Array<'email'|'sms'|'inApp'>; defaultCurrency: string; language: 'en-US'|'en-GB'|'fr-FR' }; setPreferenceField<K>(key, value): void; togglePreferenceChannel(channel): void }
type MetaSlice = { currentStep: number; completedSteps: number[]; goNext(): void; goBack(): void }
type WizardState = ContactSlice & BillingSlice & PreferencesSlice & MetaSlice
type WizardStore = WizardState & { reset(): void }
const initialWizardData: Pick<WizardState, 'contact'|'billing'|'preferences'|'currentStep'|'completedSteps'>
```

### `src/app/(app)/customers/new/_lib/wizard/schemas.ts`
```ts
const contactSchema: z.ZodStrictObject     // firstName/lastName min1 max80, email, phone min7 max20
const billingSchema: z.ZodStrictObject     // all fields min1 except line2; country length(2); paymentTerms enum
const preferencesSchema: z.ZodStrictObject // channels array min1; defaultCurrency length(3); language enum
const createCustomerInput: z.ZodStrictObject  // { contact, billing, preferences }
type CreateCustomerInput = z.infer<typeof createCustomerInput>
```

### `src/app/(app)/customers/new/_lib/wizard/store.ts`
```ts
const createWizardStore = (): StoreApi<WizardStore>  // zustand/vanilla, composes all four slices + reset
type WizardStoreApi = ReturnType<typeof createWizardStore>
```

### Slice creators (contact-slice, billing-slice, preferences-slice, meta-slice)
Each exports a single `StateCreator<WizardStore, [], [], XSlice>`:
- `createContactSlice` — `setContactField` merges single field onto `contact`
- `createBillingSlice` — `setBillingField` merges single field onto `billing`
- `createPreferencesSlice` — `setPreferenceField` merges single field; `togglePreferenceChannel` adds/removes from array
- `createMetaSlice` — `goNext` increments step and appends to `completedSteps` (no dup); `goBack` clamps to 1

### `src/app/(app)/customers/new/_lib/wizard/selectors.ts`
```ts
const selectCurrentStep = (s: WizardState) => number
const selectContactFirstName = (s: WizardState) => string
const selectContactLastName  = (s: WizardState) => string
const selectContactEmail     = (s: WizardState) => string
const selectContactPhone     = (s: WizardState) => string
const selectIsStepValid = (state: WizardState): boolean  // runs schema.safeParse on current step's slice
const selectStepErrors  = (state: WizardState): Record<string, string[]>  // z.flattenError fieldErrors
```

### `src/app/(app)/customers/new/_lib/wizard/actions.ts`
```ts
// 'use server'
const createCustomer = authedInputAction('member', createCustomerInput, async (input, ctx) => Result<{ id: string }>)
// Happy path: pushCustomer → logAudit → revalidatePath('/customers') → ok({ id })
// Error paths: consumeForceFailure → err('internal'); code 23505 → conflict(msg, null); throw → rethrows to authedInputAction
```

### `src/app/(app)/customers/new/_components/wizard-store-provider.tsx`
```ts
const WizardStoreContext: Context<WizardStoreApi | null>
type WizardStoreProviderProps = { children: ReactNode; storeModuleScoped?: boolean; providerOnStepPage?: boolean }
const WizardStoreProvider: FC<WizardStoreProviderProps>
// storeModuleScoped=true → module-scoped singleton (cross-session leak demo)
// providerOnStepPage=true → re-pins store per pathname (draft-cleared-on-nav demo)
// Both default false → correct per-request isolated store
```

### `src/app/(app)/customers/new/_components/use-wizard-store.ts`
```ts
function useWizardStore<T>(selector: (s: WizardStore) => T): T
// Throws if used outside WizardStoreProvider
```

### `src/app/(app)/customers/new/_components/use-broadcast-snapshot.ts`
```ts
const useBroadcastSnapshot = (store: WizardStoreApi): void
// Posts { source: 'wizard-snapshot', snapshot: { contact, billing, preferences, currentStep, completedSteps } } to parent on every store change
// Listens for { source: 'wizard-control', action: 'reset'|'submit' } inbound
```

### `src/app/(app)/customers/new/_components/use-broadcast-render.ts`
```ts
const useBroadcastRender = (field: string): void
// Posts { source: 'wizard-render', field } to parent on every commit (no dep array)
// No-op when window.parent === window (not in iframe)
```

### `src/app/inspector/actions.ts`
```ts
// All 'use server'
const switchIdentity = async (formData: FormData): Promise<void>
const resetAndReseed  = async (): Promise<void>
const armForceFailureForActor = async (formData: FormData): Promise<void>
const toggleDebugFlag = async (formData: FormData): Promise<void>
```

### `src/app/inspector/inspector-panel.tsx`
```ts
// Client component
type Snapshot = { currentStep?, completedSteps?, contact?, billing?, preferences? }
const InspectorPanel: FC  // iframe + snapshot panel + render-count panel + control buttons
```

### `src/lib/utils.ts`
```ts
const cn = (...inputs: ClassValue[]) => string
```

---

## Dependencies

From `package.json` (name: `chapter-079-routed-customer-wizard`):

**Runtime:**
| Package | Version |
|---|---|
| next | 16.2.7 |
| react | 19.2.4 |
| react-dom | 19.2.4 |
| zustand | ^5.0.14 |
| zod | ^4.4.3 |
| nuqs | ^2.8.9 |
| next-themes | ^0.4.6 |
| sonner | ^2.0.7 |
| radix-ui | ^1.4.3 |
| clsx | ^2.1.1 |
| tailwind-merge | ^3.6.0 |
| class-variance-authority | ^0.7.1 |
| lucide-react | ^1.17.0 |
| tw-animate-css | ^1.4.0 |
| uuidv7 | ^1.0.2 |

**Dev:**
| Package | Version |
|---|---|
| @biomejs/biome | 2.4.16 |
| typescript | ^6.0.3 |
| tailwindcss | ^4.3.0 |
| vitest | ^4.1.8 |
| babel-plugin-react-compiler | 1.0.0 |
| @tailwindcss/postcss | ^4.3.0 |
| vite-tsconfig-paths | ^5.1.4 |

---

## Start diff

The start and solution have the same file set. All differences are stub implementations replaced by working code:

### Files with TODO stubs in start (resolved in solution):

**`_lib/wizard/wizard-types.ts`** (`TODO(L2)`)
- Start: has the same complete type definitions but the TODO comment remains as first line. The types and `initialWizardData` are fully provided in start — students read but don't modify this file.

**`_lib/wizard/contact-slice.ts`** (`TODO(L2)`)
- Start: `setContactField: () => {}` (no-op stub)
- Solution: `setContactField: (key, value) => set((s) => ({ contact: { ...s.contact, [key]: value } }))`

**`_lib/wizard/billing-slice.ts`** (`TODO(L2)`)
- Same pattern: `setBillingField` is a no-op stub in start, real merge in solution.

**`_lib/wizard/preferences-slice.ts`** (`TODO(L2)`)
- Start: `setPreferenceField: () => {}` and `togglePreferenceChannel: () => {}` stubs
- Solution: both implemented with real set logic.

**`_lib/wizard/meta-slice.ts`** (`TODO(L2)`)
- Start: `goNext: () => {}` and `goBack: () => {}` stubs
- Solution: `goNext` increments step and pushes to `completedSteps`; `goBack` clamps to 1.

**`_lib/wizard/store.ts`** (`TODO(L2)`)
- Start: `reset: () => {}` stub; only imports `type WizardStore` (no `initialWizardData`)
- Solution: `reset: () => a[0]({ ...composeSlices(...a), ...initialWizardData }, true)` — imports and uses `initialWizardData`

**`_components/wizard-store-provider.tsx`** (`TODO(L2)`)
- Start: stub provider that renders children with no store context
- Solution: full `useRef`-pinned store, debug-flag-aware mounting, `useBroadcastSnapshot` wired

**`_components/use-wizard-store.ts`** (`TODO(L2)`)
- Start: stub `useWizardStore` returning a hardcoded default
- Solution: reads `WizardStoreContext`, throws if null, returns `useStore(store, selector)`

**`_lib/wizard/selectors.ts`** (`TODO(L3)`)
- Start: `selectIsStepValid` always returns `false`; `selectStepErrors` always returns `{}`; `selectContactFirstName` etc. are missing
- Solution: full steps array + real `safeParse` logic + all atomic contact selectors

**`new/step-1/page.tsx`** (`TODO(L3)`)
- Start: placeholder with TODO comment, no field components
- Solution: four atomic field components each subscribing to its own selector/setter/error

**`new/step-2/page.tsx`** (`TODO(L3)`)
- Start: placeholder with TODO comment
- Solution: eight atomic field components for billing

**`new/step-3/page.tsx`** (`TODO(L3)`)
- Start: placeholder with TODO comment
- Solution: three controls for preferences

**`new/footer.tsx`** (`TODO(L3)`)
- Start: renders static Back/Next buttons with no store wiring
- Solution: reads `selectCurrentStep`, `selectIsStepValid`, `goNext`, `goBack`; uses `useBroadcastRender('footer')`; disables Next when invalid

**`new/step-4/page.tsx`** (`TODO(L4)`)
- Start: renders a static placeholder
- Solution: `useShallow` pick of contact/billing/preferences + renders review sections + `<SubmitButton />`

**`new/step-4/submit-button.tsx`** (`TODO(L4)`)
- Start: static button with no action
- Solution: `useTransition` guard, `createCustomer` call, `reset()` + `router.push` on success, inline error display

**`_lib/wizard/actions.ts`** (`TODO(L4)`)
- Start: `createCustomer` exported as an empty async function returning `ok({ id: '' })`
- Solution: full `authedInputAction` with `consumeForceFailure`, `pushCustomer`, `isUniqueViolation` → `conflict`, `logAudit`, `revalidatePath`

### Files identical between start and solution:
All infrastructure files are complete in both: `wizard-types.ts` (types fully defined), `schemas.ts`, `use-broadcast-snapshot.ts`, `use-broadcast-render.ts`, `layout.tsx`, `wizard-progress.tsx`, `inspector/` all files, `server/` all files, `lib/` all shared files, `components/ui/` all files, root `layout.tsx`, `page.tsx`, `providers.tsx`.
