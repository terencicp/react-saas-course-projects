# Chapter 055 — Codebase Summary

Email + password authentication end-to-end: sign-up with email verification, sign-in with rate-limit/unverified-email handling, a gated protected layout, and sign-out. Built on Better Auth + Drizzle + Resend/React Email + Next.js 16 App Router.

---

## Solution file tree

```
src/
  env.ts                                    — t3-env schema: all server + client env vars
  proxy.ts                                  — Edge middleware: presence-only cookie gate + ?next= round-trip
  db/
    index.ts                                — Drizzle client (postgres-js); merges auth + suppression schemas
    columns.ts                              — Reusable `timestamps` column group (createdAt, precision:3)
    schema.ts                               — emailSuppressions table + suppressionReason enum
    schema/auth.ts                          — CLI-generated: user / session / account / verification tables
  lib/
    utils.ts                                — cn() Tailwind class utility
    result.ts                               — Result<T> type + ok/err helpers + isUniqueViolation
    auth.ts                                 — betterAuth instance, SESSION_COOKIE_PREFIX, getCurrentUser, requireUser
    auth-client.ts                          — Same-origin Better Auth React client (browser only)
    auth-schema.config.ts                   — CLI-only betterAuth mirror (server-only-free) for auth:generate
    redirects.ts                            — safeNext() open-redirect guard
    suppressions.ts                         — isSuppressed() Drizzle lookup
    email.ts                                — sendEmail() Resend wrapper (suppression check + Result)
    auth/
      error-mapping.ts                      — mapAuthError(): APIError → Result<never>
  emails/
    email-tailwind-config.ts                — Shared pixelBasedPreset + brand color tokens for email
    welcome-verification.tsx                — WelcomeVerification email template (React Email)
    components/
      email-layout.tsx                      — EmailLayout: header logo + footer chrome (no Html/Tailwind)
  app/
    globals.css                             — Tailwind base + CSS variables
    layout.tsx                              — RootLayout: ThemeProvider + Toaster
    page.tsx                                — Home: redirect('/sign-in')
    _components/
      providers.tsx                         — Providers: next-themes ThemeProvider wrapper
      field-error.tsx                       — FieldError: inline form field error display
      submit-button.tsx                     — SubmitButton: useFormStatus spinner wrapper
    api/auth/[...all]/route.ts              — Better Auth catch-all handler (GET + POST)
    (auth)/
      sign-up/
        page.tsx                            — SignUpPage: renders SignUpForm
        sign-up-form.tsx                    — SignUpForm client component (useActionState)
        actions.ts                          — signUpAction server action
      sign-in/
        page.tsx                            — SignInPage: reads ?next= from searchParams, passes to SignInForm
        sign-in-form.tsx                    — SignInForm client component (resend-verification branch)
        actions.ts                          — signInAction server action
        loading.tsx                         — Null Suspense seam for searchParams prerender
      verify-email/
        page.tsx                            — VerifyEmailPage: shows email + VerifyEmailResend
        verify-email-resend.tsx             — VerifyEmailResend client component (authClient resend)
        loading.tsx                         — Null Suspense seam
    (protected)/
      layout.tsx                            — ProtectedLayout: AppNav (requireUser + sign-out form)
      sign-out-action.ts                    — signOutAction server action
      dashboard/
        page.tsx                            — DashboardPage: getCurrentUser(), hello greeting
        loading.tsx                         — Skeleton loading state
tests/
  lessons/
    Lesson 2.test.ts                        — Placeholder (describe.todo)
    Lesson 3.test.ts                        — Placeholder (describe.todo)
    Lesson 4.test.ts                        — Placeholder (describe.todo)
    Lesson 5.test.ts                        — Placeholder (describe.todo)
next.config.ts                              — cacheComponents, typedRoutes, reactCompiler, turbopack
drizzle.config.ts                           — Drizzle Kit config: two-file schema array, snake_case
vitest.config.ts                            — Vitest config
biome.json                                  — Biome linter/formatter config
tsconfig.json                               — TypeScript config
package.json                                — Dependencies and scripts
```

---

## Contracts

### `src/env.ts`
```ts
export const env: {
  // server
  DATABASE_URL: string          // z.url()
  DATABASE_URL_UNPOOLED: string // z.url()
  SEED: number                  // z.coerce.number().default(1)
  BETTER_AUTH_SECRET: string    // z.string().min(32)
  BETTER_AUTH_URL: string       // z.url()
  RESEND_API_KEY: string        // z.string().min(1)
  EMAIL_FROM: string            // z.string().min(1)
  EMAIL_REPLY_TO: string        // z.email()
  // client
  NEXT_PUBLIC_APP_NAME: string  // z.string().min(1)
  NEXT_PUBLIC_APP_URL: string   // z.url()
}
```

### `src/proxy.ts`
```ts
export async function proxy(request: NextRequest): Promise<NextResponse>
export const config = { matcher: ['/dashboard/:path*', '/sign-in', '/sign-up'] }
// /dashboard/* without session cookie → redirect /sign-in?next=…
// /sign-in or /sign-up with session cookie → redirect /dashboard
```

### `src/db/columns.ts`
```ts
export const timestamps = {
  createdAt: timestamp({ withTimezone: true, precision: 3 }).defaultNow().notNull()
}
```

### `src/db/schema.ts`
```ts
export const suppressionReason: PgEnum<['hard_bounce','soft_bounce_threshold','complaint','manual_unsubscribe']>

// Table: email_suppressions
// id uuid PK (uuidv7()), email text unique, reason suppressionReason,
// providerEventId text?, bypassUntil timestamptz?, metadata jsonb?,
// createdAt timestamptz precision:3, updatedAt timestamptz
export const emailSuppressions: PgTable

export type EmailSuppression
export type NewEmailSuppression
```

### `src/db/schema/auth.ts` (CLI-generated)
```
user:         id text PK, name, email unique, emailVerified bool, image?, createdAt, updatedAt
session:      id text PK, expiresAt, token unique, ipAddress?, userAgent?, userId FK→user(cascade)
              index: session_userId_idx
account:      id text PK, accountId, providerId, userId FK→user(cascade), accessToken?, refreshToken?,
              idToken?, accessTokenExpiresAt?, refreshTokenExpiresAt?, scope?, password?, createdAt, updatedAt
              index: account_userId_idx
verification: id text PK, identifier, value, expiresAt, createdAt, updatedAt
              index: verification_identifier_idx
```
Relations: `userRelations` (many sessions, many accounts), `sessionRelations`/`accountRelations` (one user).

**Note:** In better-auth@1.6.14, the email-verification token is a stateless signed JWT in the verify URL. Sign-up and resend do NOT write a verification row — the table stays empty. Verifying flips `user.emailVerified` to `true`.

### `src/db/index.ts`
```ts
export const db: DrizzlePostgresJsDatabase  // merged suppressionsSchema + authSchema, casing: snake_case
export const dbUnpooled: typeof db           // alias (no-op locally; real split in Unit 20)
```

### `src/lib/result.ts`
```ts
export type ErrorCode = 'validation'|'conflict'|'not_found'|'unauthorized'|'forbidden'|'rate_limited'|'internal'
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; userMessage: string; fieldErrors?: Record<string, string[]> } }
export const ok: <T>(data: T) => Result<T>
export const err: (code: ErrorCode, userMessage: string, fieldErrors?: Record<string, string[]>) => Result<never>
export const isUniqueViolation: (e: unknown) => boolean  // detects SQLSTATE 23505 via error.cause.code
```

### `src/lib/auth.ts`
```ts
export const SESSION_COOKIE_PREFIX: string
  // '__Host-better-auth' in production, 'better-auth' in dev

export const auth: ReturnType<typeof betterAuth>
  // emailAndPassword: { enabled, requireEmailVerification:true, minPasswordLength:12, autoSignIn:false }
  // emailVerification: { sendOnSignUp:true, autoSignInAfterVerification:true, expiresIn:3600 }
  // session: { expiresIn:30d, updateAge:1d, freshAge:10min, cookieCache:5min }
  // plugins: [nextCookies()]  ← MUST be last

type User = typeof auth.$Infer.Session.user

export const getCurrentUser: () => Promise<User | null>  // React cache deduped per request
export const requireUser: (next?: string) => Promise<User>  // redirect /sign-in[?next=] if no session
```

### `src/lib/auth-client.ts`
```ts
export const authClient: ReturnType<typeof createAuthClient>
  // same-origin (no baseURL); used by SignInForm.handleResend and VerifyEmailResend
```

### `src/lib/auth-schema.config.ts`
```ts
export const auth: ReturnType<typeof betterAuth>
  // CLI-only mirror, server-only-free; drizzleAdapter(db, { provider:'pg' }) + emailAndPassword:{enabled:true}
```

### `src/lib/auth/error-mapping.ts`
```ts
export const mapAuthError: (error: unknown) => Result<never>
  // statusCode 429                    → rate_limited
  // code 'INVALID_EMAIL_OR_PASSWORD'  → unauthorized
  // code 'EMAIL_NOT_VERIFIED'         → forbidden
  // else                              → internal
```

### `src/lib/redirects.ts`
```ts
export const safeNext: (raw: unknown) => string | undefined
  // Accepts paths starting with '/' but not '//' and containing no ':'
```

### `src/lib/suppressions.ts`
```ts
export const isSuppressed: (
  email: string,
  opts: { kind: 'transactional' | 'marketing' }
) => Promise<{ suppressed: boolean; reason?: string; bypassUntil?: Date }>
  // manual_unsubscribe never suppresses transactional sends
  // bypassUntil window takes precedence over suppression
```

### `src/lib/email.ts`
```ts
export type SendInput = {
  to: string; subject: string; react: ReactNode; idempotencyKey: string;
  replyTo?: string; bypassSuppression?: boolean;
}
export const sendEmail: (input: SendInput) => Promise<Result<{ id: string }>>
  // normalizes to (trim+lowercase), checks isSuppressed, calls resend.emails.send with idempotencyKey
```

### `src/lib/utils.ts`
```ts
export const cn: (...inputs: ClassValue[]) => string
```

### `src/app/api/auth/[...all]/route.ts`
```ts
export const { POST, GET } = toNextJsHandler(auth)
```

### `src/app/(auth)/sign-up/actions.ts`
```ts
// SignUpSchema = z.strictObject({ name: string.min(1).max(80), email: email (trim+lowercase), password: string.min(12) })
export const signUpAction: (prevState: Result<never> | null, formData: FormData) => Promise<Result<never>>
  // On success: redirect /verify-email?email=…  (no taken-email branch; enumeration-safe)
```

### `src/app/(auth)/sign-in/actions.ts`
```ts
// SignInSchema = z.strictObject({ email: email (trim+lowercase), password: string.min(1), next: string.optional() })
export const signInAction: (prevState: Result<never> | null, formData: FormData) => Promise<Result<never>>
  // On success: redirect safeNext(next) ?? '/dashboard'
```

### `src/app/(auth)/sign-up/sign-up-form.tsx`
```ts
export const SignUpForm: () => JSX.Element
  // 'use client'; useActionState(signUpAction, null); name/email/password + FieldError + SubmitButton
```

### `src/app/(auth)/sign-in/sign-in-form.tsx`
```ts
type SignInFormProps = { next?: string }
export const SignInForm: (props: SignInFormProps) => JSX.Element
  // 'use client'; hidden next input; resend link shown when error.code === 'forbidden'
  // calls authClient.sendVerificationEmail(emailRef.current.value)
```

### `src/app/(auth)/verify-email/verify-email-resend.tsx`
```ts
type VerifyEmailResendProps = { email: string }
export const VerifyEmailResend: (props: VerifyEmailResendProps) => JSX.Element
  // 'use client'; calls authClient.sendVerificationEmail({ email, callbackURL: '/dashboard' })
```

### `src/app/(protected)/layout.tsx`
```ts
export default async function ProtectedLayout({ children: ReactNode }): JSX.Element
  // AppNav (async SC): requireUser('/dashboard') → shows user.email + sign-out form
  // AppNav wrapped in <Suspense>; children in <main>
```

### `src/app/(protected)/sign-out-action.ts`
```ts
export const signOutAction: () => Promise<never>
  // 'use server'; auth.api.signOut({ headers }) then redirect('/sign-in')
```

### `src/app/(protected)/dashboard/page.tsx`
```ts
export default DashboardPage: () => Promise<JSX.Element>
  // getCurrentUser() (React-cache hit, no extra DB round trip); shows Hello {name} + email
```

### `src/app/_components/field-error.tsx`
```ts
type FieldErrorProps = { name: string; fieldErrors: Record<string, string[]> | undefined }
export const FieldError: (props: FieldErrorProps) => JSX.Element | null
  // renders first error for fieldErrors[name]; role="alert"
```

### `src/app/_components/submit-button.tsx`
```ts
type SubmitButtonProps = ComponentProps<typeof Button> & { children: ReactNode }
export const SubmitButton: (props: SubmitButtonProps) => JSX.Element
  // 'use client'; useFormStatus(); Loader2 spinner while pending; forwards all props to Button
```

### `src/app/_components/providers.tsx`
```ts
export const Providers: ({ children }: { children: ReactNode }) => JSX.Element
  // 'use client'; ThemeProvider (next-themes, attribute="class", defaultTheme="system")
```

### `src/emails/welcome-verification.tsx`
```ts
export type WelcomeVerificationProps = { firstName: string; verifyUrl: string }
export default WelcomeVerification: (props: WelcomeVerificationProps) => JSX.Element
  // WelcomeVerification.PreviewProps = { firstName: 'Ada', verifyUrl: 'https://acme.example/verify/abc-123' }
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
export const EmailLayout: ({ children }: { children: ReactNode }) => JSX.Element
  // Logo header + max-w-[600px] Container + legal footer
  // Module-level literals only (APP_NAME, APP_URL, LEGAL_ADDRESS) — no process.env, no new Date()
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

### `drizzle.config.ts`
```ts
// dialect: 'postgresql'
// schema: ['./src/db/schema.ts', './src/db/schema/auth.ts']
// out: './drizzle', casing: 'snake_case'
// dbCredentials: { url: DATABASE_URL_UNPOOLED }
```

---

## Dependencies

**dependencies:**
| Package | Version |
|---|---|
| `next` | 16.2.7 |
| `react` / `react-dom` | 19.2.4 |
| `better-auth` | ^1.6.14 |
| `drizzle-orm` | ^0.45.1 |
| `postgres` | ^3.4.7 |
| `resend` | ^6.12.4 |
| `react-email` | ^6.5.0 |
| `zod` | ^4.4.3 |
| `@t3-oss/env-nextjs` | ^0.13.11 |
| `next-themes` | ^0.4.6 |
| `sonner` | ^2.0.7 |
| `server-only` | ^0.0.1 |
| `uuidv7` | ^1.0.2 |
| `radix-ui` | ^1.4.3 |
| `lucide-react` | ^1.17.0 |
| `class-variance-authority` | ^0.7.1 |
| `clsx` | ^2.1.1 |
| `tailwind-merge` | ^3.6.0 |
| `tw-animate-css` | ^1.4.0 |

**devDependencies:**
| Package | Version |
|---|---|
| `@biomejs/biome` | 2.4.16 |
| `typescript` | ^6.0.3 |
| `drizzle-kit` | ^0.31.5 |
| `drizzle-zod` | ^0.8.0 |
| `drizzle-seed` | ^0.3.1 |
| `tailwindcss` | ^4.3.0 |
| `@tailwindcss/postcss` | ^4.3.0 |
| `vitest` | ^4.1.8 |
| `tsx` | ^4.20.0 |
| `auth` (better-auth CLI) | ^1.6.14 |
| `babel-plugin-react-compiler` | 1.0.0 |
| `dotenv-cli` | ^10.0.0 |
| `@react-email/ui` | ^6.5.0 |

---

## Start diff

The `start/` and `solution/` trees are structurally identical with one exception: `src/app/(auth)/verify-email/verify-email-resend.tsx` exists only in `solution/` — it is a new file students create in L3.

All other files are present in both; `start/` contains TODO stubs where students implement each lesson's exercise.

### TODOs by lesson

**L2 — Better Auth setup, email verification, sign-up action:**
- `src/env.ts` — missing `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`
- `src/lib/auth.ts` — entire auth instance is a stub: exports `SESSION_COOKIE_PREFIX = 'better-auth'`, `getCurrentUser = async () => null`, `requireUser` that throws, `auth = {} as never`
- `src/lib/auth-schema.config.ts` — empty stub
- `src/db/schema/auth.ts` — empty stub (run `pnpm auth:generate`)
- `src/db/index.ts` — does not import or spread `authSchema`
- `src/app/api/auth/[...all]/route.ts` — empty stub
- `src/app/(auth)/sign-up/actions.ts` — returns `err('internal', 'Not implemented')`
- `src/emails/welcome-verification.tsx` — template body renders only `<Text>Verify email — TODO(L2)</Text>`

**L3 — Verify-email page:**
- `src/app/(auth)/verify-email/page.tsx` — renders only `<h1>Check your inbox</h1>`, no email display, no resend component
- `src/app/(auth)/verify-email/verify-email-resend.tsx` — file does not exist; student creates it

**L4 — Sign-in action:**
- `src/app/(auth)/sign-in/actions.ts` — returns `err('internal', 'Not implemented')`

**L5 — Protected layout, dashboard, sign-out, middleware:**
- `src/app/(protected)/layout.tsx` — returns `<>{children}</>` with no nav or auth gate
- `src/app/(protected)/dashboard/page.tsx` — renders static `<h1>Dashboard</h1>`
- `src/app/(protected)/sign-out-action.ts` — empty stub
- `src/proxy.ts` — empty stub (only TODO comment)

**Test stubs** — All four test files (`Lesson 2–5.test.ts`) are identical between start and solution: `describe.todo(...)` placeholders.
