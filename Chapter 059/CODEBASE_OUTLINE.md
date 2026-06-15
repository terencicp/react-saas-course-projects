# Chapter 059 — Codebase Summary

## Solution file tree

```
src/
  env.ts                                        — t3-oss/env-nextjs boundary; validates all env vars at build time
  proxy.ts                                      — Next.js middleware: presence-only cookie redirect for /dashboard + auth pages
  db/
    index.ts                                    — drizzle client (postgres-js), merged schema, Transaction type alias, dbUnpooled alias
    columns.ts                                  — shared `timestamps` column group (createdAt, ms precision)
    schema.ts                                   — emailSuppressions table + suppressionReason enum
    schema/auth.ts                              — Better Auth CLI-generated tables: user, session, account, verification, organization, member, invitation + relations
    audit.ts                                    — auditLogs table (append-only, RLS org-isolation + deny UPDATE/DELETE policies)
    audit-log.ts                                — logAudit(tx, event): writes audit row inside a transaction; derives actor/org from requireOrgUser
    tenant.ts                                   — withTenant(orgId, fn): tx + set_config; tenantDb(orgId): typed query/insert/update/delete facade
    queries/
      members.ts                                — listMembers(orgId): tenantDb scoped read with user join
      invitations.ts                            — listPendingInvitations(orgId), getInvitationById(id): pending panel + accept path
      audit.ts                                  — auditLogCount(orgId), recentAuditLogs(orgId): read through withTenant for RLS
  lib/
    result.ts                                   — Result<T> union, ok(), err(), isUniqueViolation()
    email.ts                                    — sendEmail(): single Resend wrapper, suppression check, returns Result
    suppressions.ts                             — isSuppressed(email, opts): reads emailSuppressions; manual_unsubscribe never blocks transactional
    redirects.ts                                — safeNext(raw): open-redirect guard for ?next= values
    auth.ts                                     — betterAuth instance, session helpers: getCurrentUser, requireUser, requireOrgUser
    auth-client.ts                              — createAuthClient() with organizationClient plugin
    auth-schema.config.ts                       — CLI-only mirror of auth.ts (server-only-free) for `auth:generate`
    auth/
      roles.ts                                  — Role type, ROLE_RANK, roleAtLeast()
      authed-action.ts                          — authedAction(role, schema, fn): four-step Server Action wrapper; returns Result
      error-mapping.ts                          — mapAuthError(error): maps Better Auth APIError → Result<never>
    invitations/
      url.ts                                    — generateInviteToken(), signedInviteUrl(), verifyInviteSignature(), sha256()
      send.ts                                   — sendInvitation Server Action: token+audit co-transact, email send-after-commit
      accept.ts                                 — acceptInvitation Server Action: re-verify token, seat-grant + audit in one tx, setActiveOrganization post-commit
      manage.ts                                 — changeMemberRole Server Action: refuse owner targets, role-change + audit co-transact
  emails/
    email-tailwind-config.ts                    — shared Tailwind config object for react-email templates
    components/email-layout.tsx                 — EmailLayout wrapper component for all email templates
    welcome-verification.tsx                    — WelcomeVerification email template (sign-up verification link)
    invite.tsx                                  — InviteEmail template (org invitation with accept button + expiry)
  app/
    layout.tsx                                  — RootLayout: html/body, Providers, Toaster
    page.tsx                                    — root route: redirect('/sign-in')
    globals.css                                 — Tailwind CSS entry
    _components/
      providers.tsx                             — ThemeProvider + client context wrappers
      field-error.tsx                           — FieldError({ name, fieldErrors }): inline validation message
      submit-button.tsx                         — SubmitButton: useFormStatus-aware disabled/pending button
    api/auth/[...all]/route.ts                  — Better Auth catch-all handler: exports GET, POST
    (auth)/
      sign-up/
        page.tsx                                — sign-up page (RSC shell)
        sign-up-form.tsx                        — SignUpForm client island: name/email/password, useActionState(signUpAction)
        actions.ts                              — signUpAction: parse → auth.api.signUpEmail → redirect /verify-email
      sign-in/
        page.tsx                                — sign-in page (RSC shell)
        sign-in-form.tsx                        — SignInForm client island: email/password/next hidden, useActionState(signInAction)
        actions.ts                              — signInAction: parse → auth.api.signInEmail → safeNext redirect
        loading.tsx                             — loading skeleton
      verify-email/
        page.tsx                                — verify-email page with email param display
        verify-email-resend.tsx                 — VerifyEmailResend: resend button via authClient
        loading.tsx                             — loading skeleton
      accept-invite/
        page.tsx                                — AcceptInvitePage: verify ladder (sig→row→hash→expiry→status→identity), renders one of 6 surfaces
        accept-form.tsx                         — AcceptForm client island: hidden id+token, useActionState(acceptInvitation)
        loading.tsx                             — loading skeleton
    (protected)/
      layout.tsx                                — ProtectedLayout: AppNav (requireUser + signOutAction), Suspense-wrapped
      sign-out-action.ts                        — signOutAction: auth.api.signOut → redirect /sign-in
      dashboard/
        page.tsx                                — DashboardPage: displays user name/email
        org-switcher.tsx                        — OrgSwitcher client: authClient.organization.setActive + router.refresh()
        loading.tsx                             — loading skeleton
      inspector/
        page.tsx                                — InspectorPage: 6 Suspense-wrapped panels (ActiveOrgBanner, MembersPanel, InvitePanel, PendingPanel, AuditTail, RawHelpersPanel)
        _data.ts                                — getInspectorContext(): cache-deduped, dev acting-user cookie override
        actions.ts                              — switchUserAction (dev cookie write), resetAndReseedAction (dev reseed)
        constants.ts                            — ACTING_USER_COOKIE = 'inspector-acting-user'
        loading.tsx                             — loading skeleton
        _components/
          acting-user-switcher.tsx              — ActingUserSwitcher client: dev identity swap via switchUserAction
          invite-form.tsx                       — InviteForm client: email+role → sendInvitation
          role-select-row.tsx                   — RoleSelectRow client: per-member role select → changeMemberRole
          copy-accept-url.tsx                   — CopyAcceptUrl client: clipboard copy of pending invite URL (dev)
    onboarding/
      create-org/page.tsx                       — CreateOrgPage client: authClient.organization.create → /dashboard
  components/ui/                                — shadcn/ui primitives: button, card, input, label, select, separator, skeleton, sonner
drizzle.config.ts                               — drizzle-kit config: three-file schema array, snake_case, unpooled URL
next.config.ts                                  — cacheComponents, typedRoutes, reactCompiler, turbopack
tsconfig.json                                   — TypeScript config
biome.json                                      — Biome linter/formatter config
vitest.config.ts                                — Vitest config
package.json                                    — project manifest
.env / .env.example                             — environment variable templates
```

---

## Contracts

### `src/env.ts`
```ts
export const env: {
  // server
  DATABASE_URL: string           // z.url()
  DATABASE_URL_UNPOOLED: string  // z.url()
  SEED: number                   // z.coerce.number().default(1)
  BETTER_AUTH_SECRET: string     // z.string().min(32)
  BETTER_AUTH_URL: string        // z.url()
  RESEND_API_KEY: string         // z.string().min(1)
  EMAIL_FROM: string             // z.string().min(1)
  EMAIL_REPLY_TO: string         // z.email()
  INVITATION_SIGNING_SECRET: string // z.string().min(1)
  // client
  NEXT_PUBLIC_APP_NAME: string   // z.string().min(1)
  NEXT_PUBLIC_APP_URL: string    // z.url()
}
```

### `src/proxy.ts`
```ts
export async function proxy(request: NextRequest): Promise<NextResponse>
export const config: { matcher: string[] }
// matcher: ['/dashboard/:path*', '/sign-in', '/sign-up']
```

### `src/db/index.ts`
```ts
export const db: DrizzleInstance             // combined schema: suppressions + auth + audit
export const dbUnpooled: DrizzleInstance     // alias for db (no-op locally)
export type Transaction                       // = Parameters<Parameters<typeof db.transaction>[0]>[0]
```

### `src/db/columns.ts`
```ts
export const timestamps: { createdAt: PgColumn }  // withTimezone, precision: 3
```

### `src/db/schema.ts` (emailSuppressions)
```
suppressionReason enum: 'hard_bounce' | 'soft_bounce_threshold' | 'complaint' | 'manual_unsubscribe'

emailSuppressions table:
  id             uuid PK  default uuidv7()
  email          text NOT NULL UNIQUE
  reason         suppressionReason NOT NULL
  providerEventId text
  bypassUntil    timestamp(tz)
  metadata       jsonb
  createdAt      timestamp(tz,p3) default now
  updatedAt      timestamp(tz) default now

export type EmailSuppression
export type NewEmailSuppression
```

### `src/db/schema/auth.ts` (CLI-generated)
```
user: id(text PK), name, email(unique), emailVerified, image, createdAt, updatedAt
session: id(text PK), expiresAt, token(unique), ipAddress, userAgent, userId→user, activeOrganizationId(text)
account: id(text PK), accountId, providerId, userId→user, accessToken, refreshToken, idToken, password, ...
verification: id(text PK), identifier, value, expiresAt, createdAt, updatedAt
organization: id(text PK), name, slug(unique), logo, createdAt, metadata
member: id(text PK), organizationId→organization, userId→user, role(default 'member'), createdAt
invitation: id(text PK), organizationId→organization, email, role, status(default 'pending'),
            expiresAt, createdAt, inviterId→user, tokenHash(text NOT NULL), acceptedAt(timestamp)

Relations: userRelations, sessionRelations, accountRelations, organizationRelations,
           memberRelations, invitationRelations
```

### `src/db/audit.ts`
```
auditLogs table (RLS enabled):
  id             uuid PK  default uuidv7()
  organizationId text NOT NULL → organization.id (cascade)
  actorUserId    text → user.id (set null)
  actorIp        text
  actorUserAgent text
  action         text NOT NULL
  subjectType    text NOT NULL
  subjectId      text NOT NULL
  payload        jsonb<Record<string,unknown>> default {}
  createdAt      timestamp(tz) default now

Policies:
  audit_logs_org_isolation (permissive, all, authenticated): org_id = current_setting('app.org_id', true)
  audit_logs_no_update (restrictive, update, authenticated): false
  audit_logs_no_delete (restrictive, delete, authenticated): false

Indexes: idx_audit_logs_org_created, idx_audit_logs_org_actor_created

export type AuditLog
export type NewAuditLog
export type AuditEvent = { action: string; subjectType?: string; subjectId?: string; payload?: Record<string,unknown> }
```

### `src/db/audit-log.ts`
```ts
export const logAudit: (tx: Transaction, event: AuditEvent) => Promise<void>
// server-only; requires Transaction (not bare db); derives actor/org from requireOrgUser + headers
```

### `src/db/tenant.ts`
```ts
export const withTenant: <T>(orgId: string, fn: (tx: Transaction) => Promise<T>) => Promise<T>
// db.transaction + set_config('app.org_id', orgId, true)

export const tenantDb: (orgId: string) => {
  query: {
    member: { findMany, findFirst }    // org-scoped, preserves drizzle generics
    invitation: { findMany, findFirst }
  }
  insert: <T extends TenantTable>(table: T) => { values: (value: Omit<T['$inferInsert'], 'organizationId'>) => ... }
  update: <T extends TenantTable>(table: T) => { set: (value) => { where: (where?) => ... } }
  delete: <T extends TenantTable>(table: T) => { where: (where?) => ... }
}
// TenantTable = member | invitation
```

### `src/db/queries/members.ts`
```ts
export const listMembers: (orgId: string) => Promise<(Member & { user: User | null })[]>
```

### `src/db/queries/invitations.ts`
```ts
export type PendingInvitationRow = {
  id: string; email: string; role: string | null; expiresAt: Date;
  acceptUrl?: string; user: { name: string; email: string } | null
}
export const listPendingInvitations: (orgId: string) => Promise<PendingInvitationRow[]>
export const getInvitationById: (id: string) => Promise<Invitation | null>
// getInvitationById: unscoped (invitee is not yet a member)
```

### `src/db/queries/audit.ts`
```ts
export const auditLogCount: (orgId: string) => Promise<number>
export const recentAuditLogs: (orgId: string) => Promise<{ id: string; action: string; createdAt: Date }[]>
// both read through withTenant for RLS
```

### `src/lib/result.ts`
```ts
export type ErrorCode = 'validation' | 'conflict' | 'not_found' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'internal'
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; userMessage: string; fieldErrors?: Record<string,string[]> } }
export const ok: <T>(data: T) => Result<T>
export const err: (code: ErrorCode, userMessage: string, fieldErrors?: Record<string,string[]>) => Result<never>
export const isUniqueViolation: (e: unknown) => boolean  // checks SQLSTATE 23505 via error.cause
```

### `src/lib/email.ts`
```ts
export type SendInput = { to: string; subject: string; react: ReactNode; idempotencyKey: string; replyTo?: string; bypassSuppression?: boolean }
export const sendEmail: (input: SendInput) => Promise<Result<{ id: string }>>
// server-only; normalizes email, checks isSuppressed, calls Resend, returns Result
```

### `src/lib/suppressions.ts`
```ts
export const isSuppressed: (email: string, opts: { kind: 'transactional' | 'marketing' }) => Promise<{ suppressed: boolean; reason?: string; bypassUntil?: Date }>
// manual_unsubscribe never blocks transactional; bypassUntil overrides suppression
```

### `src/lib/redirects.ts`
```ts
export const safeNext: (raw: unknown) => string | undefined
// accepts /path only; rejects //, :, non-string
```

### `src/lib/auth.ts`
```ts
export const SESSION_COOKIE_PREFIX: string  // '__Host-better-auth' (prod) | 'better-auth' (dev)
export const INVITATION_TTL_SECONDS: number // 60*60*24*7 (7 days)
export const auth: BetterAuth               // betterAuth instance with organization + nextCookies plugins
export const getCurrentUser: () => Promise<User | null>
export const requireUser: (next?: string) => Promise<User>  // redirects to /sign-in if unauthenticated
export const requireOrgUser: () => Promise<{ user: User; orgId: string; role: Role }>
// cache-deduped; role read fresh from DB; redirects /sign-in or /onboarding/create-org
```

### `src/lib/auth-client.ts`
```ts
export const authClient: BetterAuthClient  // createAuthClient with organizationClient plugin
```

### `src/lib/auth-schema.config.ts`
```ts
export const auth: BetterAuth  // CLI-only mirror, server-only-free, schema-shaping options only
```

### `src/lib/auth/roles.ts`
```ts
export type Role = 'owner' | 'admin' | 'member'
export const ROLE_RANK: Record<Role, number>  // { member: 0, admin: 1, owner: 2 }
export const roleAtLeast: (role: Role, required: Role) => boolean
```

### `src/lib/auth/authed-action.ts`
```ts
export type AuthedCtx = { user: OrgUser; orgId: string; role: Role; db: ReturnType<typeof tenantDb>; ip: string | null; userAgent: string | null }
export const authedAction: <TSchema extends z.ZodType, TOut>(
  role: Role,
  schema: TSchema,
  fn: (input: z.infer<TSchema>, ctx: AuthedCtx) => Promise<Result<TOut>>
) => (_prev: Result<TOut> | null, formData: FormData) => Promise<Result<TOut>>
// steps: requireOrgUser → roleAtLeast → schema.safeParse → fn
```

### `src/lib/auth/error-mapping.ts`
```ts
export const mapAuthError: (error: unknown) => Result<never>
// INVALID_EMAIL_OR_PASSWORD → unauthorized; EMAIL_NOT_VERIFIED → forbidden; 429 → rate_limited; else → internal
```

### `src/lib/invitations/url.ts`
```ts
export const generateInviteToken: () => string           // 32 random bytes as base64url
export const signedInviteUrl: (invitationId: string, rawToken: string) => Promise<string>
// HMAC-SHA256 over `${invitationId}.${rawToken}` using INVITATION_SIGNING_SECRET
// URL: /accept-invite?id=&token=&sig=
export const verifyInviteSignature: (invitationId: string, rawToken: string, sig: string) => Promise<boolean>
// constant-time via crypto.subtle.verify
export const sha256: (raw: string) => Promise<string>    // hex digest
```

### `src/lib/invitations/send.ts`
```ts
// sendInvitation = authedAction('admin', { email: z.email().toLowerCase(), role: z.enum(['admin','member']) }, fn)
// exported as: export const sendInvitation: (_prev, formData) => Promise<Result<{ invitationId: string; emailSent: boolean }>>
// contract: insert invitation + logAudit in one withTenant tx; email send AFTER commit
```

### `src/lib/invitations/accept.ts`
```ts
export const acceptInvitation: (_prev: Result<{ok:true}> | null, formData: FormData) => Promise<Result<{ok:true}>>
// NOT authedAction; schema: { id: z.string().min(1), token: z.string() }
// verifies sha256(token) === tokenHash + expiry + status='pending' + email match
// one withTenant tx: insert member + update invitation status + update user.emailVerified + insert auditLogs directly
// setActiveOrganization called AFTER commit; redirects /dashboard on success
```

### `src/lib/invitations/manage.ts`
```ts
// changeMemberRole = authedAction('admin', { memberId: z.string().min(1), newRole: z.enum(['admin','member']) }, fn)
export const changeMemberRole: (_prev, formData) => Promise<Result<{ memberId: string; role: string }>>
// refuses if target.role === 'owner'; one withTenant tx: update member role + logAudit
```

### `src/emails/invite.tsx`
```ts
export type InviteEmailProps = { orgName: string; inviterName: string; role: string; acceptUrl: string; expiresAt: Date }
export default InviteEmail  // react-email component; InviteEmail.PreviewProps provided
```

### `src/emails/welcome-verification.tsx`
```ts
export default WelcomeVerification  // props: { firstName: string; verifyUrl: string }
```

### `src/app/(auth)/sign-up/actions.ts`
```ts
export const signUpAction: (_prev: Result<never> | null, formData: FormData) => Promise<Result<never>>
// schema: { name: z.string().min(1).max(80), email: z.email(), password: z.string().min(12) }
// → auth.api.signUpEmail → redirect /verify-email?email=
```

### `src/app/(auth)/sign-in/actions.ts`
```ts
export const signInAction: (_prev: Result<never> | null, formData: FormData) => Promise<Result<never>>
// schema: { email: z.email(), password: z.string().min(1), next?: z.string() }
// → auth.api.signInEmail → safeNext redirect
```

### `src/app/(protected)/sign-out-action.ts`
```ts
export const signOutAction: () => Promise<void>
// auth.api.signOut → redirect /sign-in
```

### `src/app/(protected)/inspector/actions.ts`
```ts
export const switchUserAction: (_prev, formData) => Promise<Result<{ userId: string }>>
// dev-only; writes ACTING_USER_COOKIE; gated NODE_ENV !== 'production'
export const resetAndReseedAction: () => Promise<Result<{ reseeded: true }>>
// dev-only; calls runSeed()
```

### `src/app/(protected)/inspector/constants.ts`
```ts
export const ACTING_USER_COOKIE = 'inspector-acting-user'
```

### `src/app/(protected)/inspector/_data.ts`
```ts
export type InspectorContext = { userId: string; orgId: string; orgName: string; role: Role; orgs: SwitchableOrg[]; members: SeededUser[] }
export const getInspectorContext: () => Promise<InspectorContext>
// cache-deduped; dev: acting-user cookie overrides render identity (not action identity)
```

### `src/app/(protected)/dashboard/org-switcher.tsx`
```ts
export type SwitchableOrg = { id: string; name: string }
export const OrgSwitcher: ({ orgs, activeOrgId }: { orgs: SwitchableOrg[]; activeOrgId: string }) => JSX.Element
```

### `src/app/(protected)/inspector/_components/acting-user-switcher.tsx`
```ts
export type SeededUser = { id: string; name: string; role: string }
export const ActingUserSwitcher: ({ users, activeUserId }: { users: SeededUser[]; activeUserId: string }) => JSX.Element
```

### `src/app/(protected)/inspector/_components/invite-form.tsx`
```ts
export const InviteForm: () => JSX.Element  // email + role select → sendInvitation
```

### `src/app/(protected)/inspector/_components/role-select-row.tsx`
```ts
export const RoleSelectRow: ({ memberId, currentRole }: { memberId: string; currentRole: string }) => JSX.Element
```

### `src/app/(protected)/inspector/_components/copy-accept-url.tsx`
```ts
export const CopyAcceptUrl: ({ url }: { url: string }) => JSX.Element
```

### `src/app/(auth)/accept-invite/accept-form.tsx`
```ts
export const AcceptForm: ({ invitationId, token }: { invitationId: string; token: string }) => JSX.Element
```

### `src/app/api/auth/[...all]/route.ts`
```ts
export const GET, POST  // toNextJsHandler(auth)
```

### `drizzle.config.ts`
```
dialect: 'postgresql'
schema: ['./src/db/schema.ts', './src/db/schema/auth.ts', './src/db/audit.ts']
out: './drizzle'
casing: 'snake_case'
```

### `next.config.ts`
```ts
{ cacheComponents: true, typedRoutes: true, reactCompiler: true, turbopack: { root: __dirname } }
```

---

## Dependencies

**Runtime**
| Package | Version |
|---|---|
| next | 16.2.7 |
| react / react-dom | 19.2.4 |
| better-auth | ^1.6.14 |
| drizzle-orm | ^0.45.1 |
| postgres | ^3.4.7 |
| @t3-oss/env-nextjs | ^0.13.11 |
| zod | ^4.4.3 |
| resend | ^6.12.4 |
| react-email | ^6.5.0 |
| uuidv7 | ^1.0.2 |
| radix-ui | ^1.4.3 |
| sonner | ^2.0.7 |
| next-themes | ^0.4.6 |
| clsx / tailwind-merge / class-variance-authority | ^2.1.1 / ^3.6.0 / ^0.7.1 |
| lucide-react | ^1.17.0 |
| tw-animate-css | ^1.4.0 |
| server-only | ^0.0.1 |

**Dev**
| Package | Version |
|---|---|
| @biomejs/biome | 2.4.16 |
| drizzle-kit | ^0.31.5 |
| drizzle-zod | ^0.8.0 |
| drizzle-seed | ^0.3.1 |
| @react-email/ui | ^6.5.0 |
| @tailwindcss/postcss / tailwindcss | ^4.3.0 |
| typescript | ^6.0.3 |
| tsx / dotenv-cli | ^4.20.0 / ^10.0.0 |
| vitest | ^4.1.8 |
| babel-plugin-react-compiler | 1.0.0 |
| auth (CLI) | ^1.6.14 |

---

## Start diff

The start and solution file trees are identical. All differences are TODO stubs replaced with implementations.

**Files with TODOs in start (by lesson)**

### L2 — Organization plugin + RBAC setup
- `src/lib/auth.ts` — `organization()` plugin (teams off, `invitationExpiresIn`, schema additionalFields `tokenHash`/`acceptedAt`) and `requireOrgUser()` (resolve session org + fresh role read) are stubbed. Solution adds the full plugin config, `databaseHooks.session.create.before` for `pickInitialActiveOrg`, and the complete `requireOrgUser` with `getActiveMember` call.
- `src/lib/auth-schema.config.ts` — `organization()` plugin added (schema-shaping mirror only).
- `src/lib/auth/roles.ts` — `ROLE_RANK` object and `roleAtLeast` function are stubbed.
- `src/db/schema/auth.ts` — comment instructs running `pnpm auth:generate`; solution contains the full generated schema (organization, member, invitation tables).
- `src/app/(protected)/inspector/_data.ts` — `getInspectorContext` is a stub returning placeholder values; solution contains full implementation with acting-user cookie dev override.

### L3 — Audit log infrastructure
- `src/db/audit.ts` — entire `auditLogs` table with columns, indexes, RLS policies is a one-line TODO comment.
- `src/db/index.ts` — `auditSchema` spread into the drizzle client is stubbed.
- `src/db/audit-log.ts` — `logAudit(tx, event)` body is stubbed.
- `src/db/tenant.ts` — both `withTenant` and `tenantDb` are stubs.
- `src/db/queries/audit.ts` — both `auditLogCount` and `recentAuditLogs` are stubs.

### L4 — Tenant facade + member management
- `src/db/tenant.ts` — `tenantDb` facade is also stubbed (same file as L3 tenant.ts).
- `src/db/queries/members.ts` — `listMembers` is stubbed.
- `src/lib/auth/authed-action.ts` — the full four-step `authedAction` factory is stubbed.
- `src/lib/invitations/manage.ts` — `changeMemberRole` action is stubbed.

### L5 — Invitation send flow
- `src/env.ts` — `INVITATION_SIGNING_SECRET` env var is missing from the server block.
- `src/lib/invitations/url.ts` — `generateInviteToken`, `signedInviteUrl`, `verifyInviteSignature`, `sha256` are all stubs.
- `src/lib/invitations/send.ts` — `sendInvitation` action body is stubbed.
- `src/db/queries/invitations.ts` — `listPendingInvitations` is stubbed.
- `src/emails/invite.tsx` — template body is a stub (`<Text>Invitation — TODO(L5)</Text>`).

### L6 — Invitation accept flow
- `src/lib/invitations/accept.ts` — `acceptInvitation` action body is stubbed.
- `src/db/queries/invitations.ts` — `getInvitationById` is also stubbed (same file).

**Summary of stub count:** 24 TODO comments across 14 files. Every TODO is a complete implementation missing — no files differ structurally (no new files added in solution vs start).
