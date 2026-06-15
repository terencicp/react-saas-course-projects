# Chapter 050 — Codebase Summary

## Solution file tree

```
Chapter 050/solution/
├── next.config.ts                        — Next.js config (cacheComponents, typedRoutes, reactCompiler, turbopack)
├── drizzle.config.ts                     — Drizzle Kit config (pg, snake_case, unpooled URL)
├── tsconfig.json                         — TS config (strict, noUncheckedIndexedAccess, @/* alias)
├── vitest.config.ts                      — Vitest config (node env, tests/lessons/**/*.test.ts)
├── biome.json                            — Biome formatter/linter config
├── components.json                       — shadcn/ui registry config
├── drizzle/
│   └── 0000_init_schema.sql              — Initial migration: organizations, users, email_suppressions tables + suppression_reason enum
├── scripts/
│   └── seed.ts                           — Deterministic seed: 1 org, 1 user, 1 pre-suppressed address
├── tests/lessons/
│   ├── Lesson 3.test.ts                  — Stub (describe.todo) for suppression-gated send wrapper tests
│   └── Lesson 4.test.ts                  — Stub (describe.todo) for welcome template + send action tests
└── src/
    ├── env.ts                            — t3-oss/env-nextjs boundary; validates all env vars at build time
    ├── db/
    │   ├── index.ts                      — Drizzle client (postgres-js, snake_case casing, db + dbUnpooled)
    │   ├── schema.ts                     — Table defs: organizations, users, emailSuppressions + suppressionReason enum
    │   └── columns.ts                    — Shared timestamps column group (createdAt, precision:3)
    ├── lib/
    │   ├── email.ts                      — sendEmail() wrapper: suppression gate, Resend call, Result return
    │   ├── suppressions.ts               — isSuppressed(): queries email_suppressions, applies bypassUntil + transactional rules
    │   ├── auth-stub.ts                  — getActiveContext(): resolves seeded org+user by natural key (slug/email)
    │   ├── result.ts                     — Result<T> type, ok/err helpers, isUniqueViolation()
    │   └── utils.ts                      — cn() Tailwind class merger
    ├── emails/
    │   ├── welcome.tsx                   — WelcomeEmail React Email template (props: firstName, verifyUrl)
    │   ├── email-tailwind-config.ts      — Shared email Tailwind config (pixelBasedPreset + brand tokens)
    │   └── components/
    │       └── email-layout.tsx          — EmailLayout: header logo + footer legal chrome (no process.env reads)
    ├── app/
    │   ├── page.tsx                      — Root redirect to /inspector/send-welcome
    │   ├── layout.tsx                    — Root layout (ThemeProvider, Toaster, metadata)
    │   ├── _components/
    │   │   ├── providers.tsx             — ThemeProvider wrapper
    │   │   ├── submit-button.tsx         — SubmitButton: useFormStatus pending spinner
    │   │   └── field-error.tsx           — FieldError: renders first fieldErrors[name] message
    │   ├── actions/
    │   │   └── send-welcome.tsx          — sendWelcomeEmail Server Action: parse → getActiveContext → idempotency key → sendEmail
    │   └── inspector/
    │       └── send-welcome/
    │           ├── page.tsx              — Inspector page: renders email preview iframe via react-email render()
    │           └── send-welcome-form.tsx — SendWelcomeForm: useActionState form, success/suppression/error cards
    └── components/ui/
        ├── button.tsx                    — shadcn Button
        ├── card.tsx                      — shadcn Card, CardHeader, CardTitle, CardDescription, CardContent
        ├── input.tsx                     — shadcn Input
        ├── label.tsx                     — shadcn Label
        ├── separator.tsx                 — shadcn Separator
        ├── skeleton.tsx                  — shadcn Skeleton
        └── sonner.tsx                    — shadcn Toaster (sonner)
```

## Contracts

### `src/env.ts`
```ts
export const env: {
  // server
  DATABASE_URL: string           // z.url()
  DATABASE_URL_UNPOOLED: string  // z.url()
  SEED: number                   // z.coerce.number().default(1)
  RESEND_API_KEY: string         // z.string().min(1)
  EMAIL_FROM: string             // z.string().min(1)
  EMAIL_REPLY_TO: string         // z.email()
  // client
  NEXT_PUBLIC_APP_NAME: string   // z.string().min(1)
  NEXT_PUBLIC_APP_URL: string    // z.url()
}
```

### `src/db/schema.ts`
```ts
// Tables
organizations: { id: uuid PK uuidv7, name: text, slug: text UNIQUE, ...timestamps }
users:         { id: uuid PK uuidv7, email: text UNIQUE, name: text, ...timestamps }
emailSuppressions: {
  id: uuid PK uuidv7,
  email: text UNIQUE,
  reason: suppressionReason (enum),
  providerEventId: text?,
  bypassUntil: timestamp TZ?,
  metadata: jsonb?,
  ...timestamps,
  updatedAt: timestamp TZ defaultNow
}

// Enum
suppressionReason: 'hard_bounce' | 'soft_bounce_threshold' | 'complaint' | 'manual_unsubscribe'

// Inferred types
export type Organization, NewOrganization
export type User, NewUser
export type EmailSuppression, NewEmailSuppression
```

### `src/db/columns.ts`
```ts
export const timestamps: { createdAt: timestamp TZ precision:3 defaultNow notNull }
```

### `src/db/index.ts`
```ts
export const db: DrizzlePostgresJsDatabase   // postgres-js, snake_case casing
export const dbUnpooled: typeof db            // local alias (same client)
```

### `src/lib/result.ts`
```ts
export type ErrorCode = 'validation' | 'conflict' | 'not_found' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'internal'
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; userMessage: string; fieldErrors?: Record<string, string[]> } }
export const ok: <T>(data: T) => Result<T>
export const err: (code: ErrorCode, userMessage: string, fieldErrors?: Record<string, string[]>) => Result<never>
export const isUniqueViolation: (e: unknown) => boolean
```

### `src/lib/suppressions.ts`
```ts
// server-only
export const isSuppressed: (
  email: string,
  opts: { kind: 'transactional' | 'marketing' }
) => Promise<{ suppressed: boolean; reason?: string; bypassUntil?: Date }>
// Rules: bypassUntil > now → not suppressed; manual_unsubscribe + transactional → not suppressed
```

### `src/lib/email.ts`
```ts
// server-only
export type SendInput = {
  to: string; subject: string; react: ReactNode; idempotencyKey: string;
  replyTo?: string; bypassSuppression?: boolean;
}
export const sendEmail: (input: SendInput) => Promise<Result<{ id: string }>>
// Flow: normalize to → isSuppressed → short-circuit err('forbidden') → resend.emails.send with idempotencyKey → ok({ id })
```

### `src/lib/auth-stub.ts`
```ts
export const getActiveContext: () => Promise<{ organizationId: string; userId: string }>
// Resolves by slug='acme' / email='ada@acme.test'; throws if seed not run
```

### `src/app/actions/send-welcome.tsx`
```ts
// 'use server'
// Schema: z.strictObject({ recipientEmail: z.email(), firstName: z.string().min(1).max(80) })
export const sendWelcomeEmail: (
  _prevState: Result<{ id: string }> | null,
  formData: FormData
) => Promise<Result<{ id: string }>>
// idempotencyKey = `welcome:${userId}:${normalizedRecipient}`
// verifyUrl = `${env.NEXT_PUBLIC_APP_URL}/verify/placeholder-${idempotencyKey}`  (TODO: replace in Unit 8)
```

### `src/emails/welcome.tsx`
```ts
export type WelcomeEmailProps = { firstName: string; verifyUrl: string }
// Default export: WelcomeEmail (React Email component, default export)
// WelcomeEmail.PreviewProps = { firstName: 'Ada', verifyUrl: 'https://acme.example/verify/abc-123' }
// constants: APP_NAME = 'Acme'
```

### `src/emails/email-tailwind-config.ts`
```ts
export const emailTailwindConfig = {
  presets: [pixelBasedPreset],
  theme: { extend: { colors: { brand: '#4f46e5', 'brand-foreground': '#ffffff', muted: '#71717a' } } }
}
export default emailTailwindConfig
```

### `src/emails/components/email-layout.tsx`
```ts
export const EmailLayout: ({ children: ReactNode }) => JSX.Element
// Constants (literals, no process.env): APP_NAME='Acme', APP_URL='http://localhost:3000', LEGAL_ADDRESS='Acme, Inc. · ...'
// Copyright year is literal '© 2026' (not new Date().getFullYear())
```

### `src/app/inspector/send-welcome/page.tsx`
```ts
// Server component, default export SendWelcomePage
// Calls render(<WelcomeEmail {...WelcomeEmail.PreviewProps} />) → passes HTML to iframe srcDoc
// data-testid="inspector-page", "email-preview-frame"
```

### `src/app/inspector/send-welcome/send-welcome-form.tsx`
```ts
export const SendWelcomeForm: () => JSX.Element
// useActionState(sendWelcomeEmail, null)
// data-testid: "recipient-input", "firstname-input", "send-button", "success-card", "suppression-card", "error-card"
```

### `src/app/_components/submit-button.tsx`
```ts
type SubmitButtonProps = ComponentProps<typeof Button> & { children: ReactNode }
export const SubmitButton: (props: SubmitButtonProps) => JSX.Element
// useFormStatus() pending → spinner + disabled
```

### `src/app/_components/field-error.tsx`
```ts
type FieldErrorProps = { name: string; fieldErrors: Record<string, string[]> | undefined }
export const FieldError: (props: FieldErrorProps) => JSX.Element | null
// Renders first error for fieldErrors[name]; id="${name}-error", role="alert"
```

### `src/app/_components/providers.tsx`
```ts
export const Providers: ({ children: ReactNode }) => JSX.Element
// ThemeProvider: attribute="class", defaultTheme="system", enableSystem, disableTransitionOnChange
```

### `src/lib/utils.ts`
```ts
export const cn: (...inputs: ClassValue[]) => string
```

### `scripts/seed.ts`
```ts
export const runSeed: () => Promise<void>
// reset(dbUnpooled, {organizations, users, emailSuppressions})
// inserts: org {name:'Acme', slug:'acme'}, user {name:'Ada Lovelace', email:'ada@acme.test'}
// suppression: {email:'suppressed@send.acme.example', reason:'complaint'}
```

### `next.config.ts`
```ts
// cacheComponents: true, typedRoutes: true, reactCompiler: true, turbopack: { root: __dirname }
```

### `drizzle.config.ts`
```ts
// dialect: postgresql, schema: ./src/db/schema.ts, out: ./drizzle, casing: snake_case, unpooled URL
```

### `drizzle/0000_init_schema.sql`
Tables: `email_suppressions`, `organizations`, `users`
Enum: `suppression_reason` ('hard_bounce', 'soft_bounce_threshold', 'complaint', 'manual_unsubscribe')

## Dependencies

**Runtime**
| Package | Version |
|---|---|
| next | 16.2.7 |
| react / react-dom | 19.2.4 |
| react-email | ^6.5.0 |
| resend | ^6.12.4 |
| drizzle-orm | ^0.45.1 |
| postgres | ^3.4.7 |
| @t3-oss/env-nextjs | ^0.13.11 |
| zod | ^4.4.3 |
| next-themes | ^0.4.6 |
| sonner | ^2.0.7 |
| uuidv7 | ^1.0.2 |
| radix-ui | ^1.4.3 |
| lucide-react | ^1.17.0 |
| class-variance-authority | ^0.7.1 |
| clsx | ^2.1.1 |
| tailwind-merge | ^3.6.0 |
| tw-animate-css | ^1.4.0 |
| server-only | ^0.0.1 |

**Dev**
| Package | Version |
|---|---|
| @biomejs/biome | 2.4.16 |
| @react-email/ui | ^6.5.0 |
| @tailwindcss/postcss | ^4.3.0 |
| drizzle-kit | ^0.31.5 |
| drizzle-seed | ^0.3.1 |
| drizzle-zod | ^0.8.0 |
| tailwindcss | ^4.3.0 |
| tsx | ^4.20.0 |
| typescript | ^6.0.3 |
| vitest | ^4.1.8 |
| babel-plugin-react-compiler | 1.0.0 |
| dotenv-cli | ^10.0.0 |

## Start diff

The start directory is structurally identical to the solution. Every config file, schema, UI component, auth-stub, seed, and test stub is pre-written. Only four files contain student-facing TODO stubs, plus env keys are absent.

The start additionally has a `.env` file (not present in solution) with placeholder values for all env vars (`RESEND_API_KEY=re_xxx`, etc.) that students fill in.

**Files with TODO stubs (Lessons 3 and 4):**

`src/env.ts` — `TODO(L3)`: Missing `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` (server) and `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL` (client). Start `server:` block has only the three DB vars; `client:` is empty `{}`.

`src/lib/suppressions.ts` — `TODO(L3)`: `isSuppressed()` body is a no-op stub returning `{ suppressed: false }` with no DB query. Imports are stripped (no drizzle `eq`, no db, no schema import).

`src/lib/email.ts` — `TODO(L3)`: `sendEmail()` body is a no-op stub returning `err('internal', 'sendEmail not implemented')`. No `Resend` client instantiation, no suppression call, no env reads.

`src/emails/welcome.tsx` — `TODO(L4)`: Template body is a bare `<Tailwind><Html><Body><Text>Welcome email — TODO(L4)</Text></Body></Html></Tailwind>` skeleton. No `Head`, `Preview`, `Heading`, `Button`, `EmailLayout`, dark-mode meta, or props destructuring (parameter is `_props`).

`src/app/actions/send-welcome.tsx` — `TODO(L4)`: Action body is a no-op stub returning `err('internal', 'Not implemented')`. No schema parsing, no `getActiveContext`, no idempotency key, no `sendEmail` call.

**TODO comments verbatim:**
- `src/env.ts:7` — `TODO(L3) — add RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO (server) and NEXT_PUBLIC_APP_NAME, NEXT_PUBLIC_APP_URL (client), wire into runtimeEnv.`
- `src/lib/suppressions.ts:7` — `TODO(L3) — normalize, query email_suppressions, apply bypassUntil + manual_unsubscribe/transactional rules`
- `src/lib/email.ts:19` — `TODO(L3) — singleton Resend client, suppression read at the boundary, env-default from/replyTo, return Result`
- `src/emails/welcome.tsx:10` — `TODO(L4) — build the welcome template: EmailLayout, Preview, Heading/Text/Button, dark-mode head meta, alternate text link.`
- `src/app/actions/send-welcome.tsx:9` — `TODO(L4) — five seams: parse, getActiveContext, idempotency key, placeholder verifyUrl, sendEmail`

**In-progress note in solution `send-welcome.tsx`:**
- `// TODO(Unit 8) — replace placeholder with a real Better Auth verification token.` (line 34) — this is a forward-looking note in the solution itself, not a student task.
