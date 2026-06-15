# Chapter 069 — Codebase Summary

## Solution file tree

```
projects/Chapter 069/solution/
├── trigger.config.ts                            Trigger.dev v4 project config (dirs, maxDuration, retries)
├── drizzle.config.ts                            Drizzle Kit config
├── next.config.ts                               Next.js config
├── tsconfig.json                                TypeScript config
├── biome.json                                   Biome lint/format config
├── vitest.config.ts                             Vitest config
├── components.json                              shadcn/ui config
├── postcss.config.mjs                           PostCSS config
├── package.json                                 Deps manifest (name: chapter-069-presigned-r2-upload)
├── trigger/
│   ├── export-invoices.ts                       Parent task: page loop → R2 PUT → presigned GET → email child → close tx
│   ├── paginate-page.ts                         Child task: one page of invoices → CSV fragment
│   └── send-export-email.ts                     Child task: lookup recipient, render ExportReadyEmail, sendEmail
└── src/
    ├── env.ts                                   T3 env boundary; validates all server + client env vars (adds R2_* vars)
    ├── proxy.ts                                 Dev proxy wiring
    ├── db/
    │   ├── index.ts                             Drizzle db instance + Transaction type
    │   ├── schema.ts                            invoices, exports, emailSuppressions, fileMetadata tables + types
    │   ├── audit.ts                             auditLogs table + RLS policies + AuditEvent type
    │   ├── audit-log.ts                         logAudit() writer (session + explicit-context overloads)
    │   ├── tenant.ts                            tenantDb() facade + withTenant() tx helper
    │   ├── columns.ts                           Shared column helpers (timestamps)
    │   ├── schema/
    │   │   └── auth.ts                          Better Auth generated schema (user, session, org, member, etc.)
    │   └── queries/
    │       ├── audit.ts                         listAuditLogs() query
    │       ├── members.ts                       listMembers(), getMember() queries
    │       ├── invitations.ts                   listInvitations(), getInvitation() queries
    │       ├── invoices.ts                      listInvoices(), countInvoices() queries
    │       ├── file-metadata.ts                 getFile(), getFileDownloadUrl(), getSignedGetForKey(), listFiles()
    │       └── exports.ts                       getExport() query (inspector data)
    ├── lib/
    │   ├── r2.ts                                S3Client (R2), BUCKET, ALLOWED_CONTENT_TYPES, MAX_BYTES
    │   ├── result.ts                            Result<T>, ok(), err(), isUniqueViolation()
    │   ├── auth.ts                              requireOrgUser(), getOrganization()
    │   ├── auth-client.ts                       Better Auth client singleton
    │   ├── auth-schema.config.ts                Better Auth schema config
    │   ├── email.ts                             sendEmail() wrapper (suppression check + Resend)
    │   ├── suppressions.ts                      isSuppressed() check
    │   ├── logger.ts                            Pino logger instance
    │   ├── redirects.ts                         redirect helpers
    │   ├── trigger-client.ts                    retrieveRun(), listRunsForOrg() (Trigger.dev REST wrappers)
    │   ├── utils.ts                             cn() class-merge utility
    │   ├── auth/
    │   │   ├── authed-action.ts                 authedAction() higher-order Server Action factory
    │   │   ├── roles.ts                         Role type + role hierarchy helpers
    │   │   └── error-mapping.ts                 Better Auth error → user message map
    │   ├── exports/
    │   │   ├── day-bucket.ts                    dayBucket() → YYYY-MM-DD UTC string
    │   │   ├── errors.ts                        ExportError class (EMPTY_RESULTSET | UNKNOWN_PLAN)
    │   │   ├── start.ts                         startExport() Server Action (fire-and-forget trigger)
    │   │   └── to-csv.ts                        rowsToCsv() pure Invoice[] → RFC-4180 CSV string
    │   ├── files/
    │   │   ├── cursor.ts                        FileCursor type, encodeCursor(), decodeCursor()
    │   │   ├── errors.ts                        UploadError class (unsupported-type | too-large | size-mismatch | object-not-found)
    │   │   ├── keys.ts                          extFor(), buildObjectKey()
    │   │   ├── presigned-put.ts                 presignedPut() Server Action (sign S1, return url+uploadId+objectKey)
    │   │   ├── finalize.ts                      finalizeUpload() Server Action (HEAD S2, insert row + audit)
    │   │   └── soft-delete.ts                   softDeleteFile() (stamps softDeletedAt + audit, not wired to UI)
    │   └── invitations/
    │       ├── accept.ts                        acceptInvitation() logic
    │       ├── manage.ts                        createInvitation(), revokeInvitation()
    │       ├── send.ts                          sendInvitationEmail()
    │       └── url.ts                           buildInviteUrl(), verifyInviteToken()
    ├── emails/
    │   ├── ExportReadyEmail.tsx                 Export-ready notification email component
    │   ├── email-tailwind-config.ts             Shared Tailwind config for React Email
    │   ├── invite.tsx                           Invitation email component
    │   ├── welcome-verification.tsx             Welcome + email verification component
    │   └── components/
    │       └── email-layout.tsx                 Shared email wrapper layout
    ├── components/
    │   └── ui/
    │       ├── badge.tsx                        Badge component (new in ch069)
    │       ├── button.tsx                       Button component
    │       ├── card.tsx                         Card component
    │       ├── input.tsx                        Input component
    │       ├── label.tsx                        Label component
    │       ├── progress.tsx                     Progress bar component (new in ch069)
    │       ├── select.tsx                       Select component
    │       ├── separator.tsx                    Separator component
    │       ├── skeleton.tsx                     Skeleton component
    │       └── sonner.tsx                       Sonner toast wrapper
    ├── app/
    │   ├── layout.tsx                           Root layout (theme, providers, fonts)
    │   ├── page.tsx                             Root redirect page
    │   ├── globals.css                          Global CSS + Tailwind v4 theme
    │   ├── _components/
    │   │   ├── providers.tsx                    Client providers (theme, toaster)
    │   │   ├── field-error.tsx                  Form field error display
    │   │   └── submit-button.tsx                Submit button with pending state
    │   ├── files/
    │   │   ├── loading.tsx                      Suspense seam for /files (null shell)
    │   │   ├── page.tsx                         FilesPage: UploadForm + file list + keyset pagination
    │   │   └── upload-form.tsx                  UploadForm client component (sign→XHR PUT→finalize)
    │   ├── api/
    │   │   ├── auth/[...all]/route.ts           Better Auth catch-all handler
    │   │   └── exports/[runId]/route.ts         Run-state poller (GET → retrieveRun)
    │   ├── (auth)/
    │   │   ├── sign-in/                         Sign-in page, form, action, loading
    │   │   ├── sign-up/                         Sign-up page, form, action
    │   │   ├── verify-email/                    Email verification page, resend component, loading
    │   │   └── accept-invite/                   Accept-invite page, form, loading
    │   ├── (protected)/
    │   │   ├── layout.tsx                       Protected layout (requireOrgUser guard)
    │   │   ├── dashboard/                       Dashboard page, org-switcher, loading
    │   │   ├── inspector/                       Inspector page, debug controls, run panel, run console, acting-user switcher
    │   │   └── sign-out-action.ts               signOut() Server Action
    │   └── onboarding/
    │       └── create-org/page.tsx              Create-org onboarding page
    └── drizzle/
        └── 0008_add_file_metadata.sql           Migration: file_metadata table + unique objectKey + composite index
```

## Contracts

### `src/env.ts`
```
env.server: DATABASE_URL, DATABASE_URL_UNPOOLED, SEED, BETTER_AUTH_SECRET, BETTER_AUTH_URL,
            RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO, INVITATION_SIGNING_SECRET,
            TRIGGER_SECRET_KEY (startsWith 'tr_'), TRIGGER_PROJECT_REF (startsWith 'proj_'),
            APP_URL,
            R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
env.client: NEXT_PUBLIC_APP_NAME, NEXT_PUBLIC_APP_URL
```

### `src/lib/r2.ts`
```ts
export const r2: S3Client                        // region:'auto', endpoint from R2_ACCOUNT_ID, checksums WHEN_REQUIRED
export const BUCKET: string                      // env.R2_BUCKET_NAME
export const ALLOWED_CONTENT_TYPES: readonly [
  'image/png','image/jpeg','image/webp','application/pdf','text/csv'
]
export const MAX_BYTES: number                   // 25 * 1024 * 1024
```

### `src/lib/files/keys.ts`
```ts
export const extFor: (contentType: AllowedContentType) => string
export const buildObjectKey: (args: { orgId: string; fileId: string; contentType: AllowedContentType }) => string
// Result pattern: `org/${orgId}/files/${fileId}.${ext}`
```

### `src/lib/files/errors.ts`
```ts
export class UploadError extends Error {
  override readonly name: 'UploadError'
  readonly code: 'unsupported-type' | 'too-large' | 'size-mismatch' | 'object-not-found'
  constructor(code, message)
  static toResult(e: UploadError): Result<never>   // maps code → ErrorCode
}
```

### `src/lib/files/presigned-put.ts`
```ts
// 'use server' Server Action, role: 'member'
export const presignedPut: authedAction(
  'member',
  z.strictObject({ fileName, contentType: z.enum(ALLOWED_CONTENT_TYPES), claimedSize: coerce.number.int.positive.max(MAX_BYTES) }),
  async (input, ctx) => Promise<Result<{ uploadId: string; url: string; objectKey: string }>>
)
// S1: signs PutObjectCommand, expiresIn: 300s, signableHeaders: content-type. NO db write.
```

### `src/lib/files/finalize.ts`
```ts
// 'use server' Server Action, role: 'member'
export const finalizeUpload: authedAction(
  'member',
  z.strictObject({ uploadId: uuid, objectKey, originalFileName, contentType: z.enum(ALLOWED_CONTENT_TYPES) }),
  async (input, ctx) => Promise<Result<{ fileId: string }>>
)
// S2: HeadObjectCommand → verify ContentType + ContentLength ≤ MAX_BYTES → tenantDb transaction:
//     insert fileMetadata row (id=uploadId, HEAD-observed byteSize/contentType) + logAudit('file.uploaded')
// 404 HEAD → object-not-found; type mismatch / oversized → size-mismatch; duplicate key → conflict
```

### `src/lib/files/soft-delete.ts`
```ts
export const softDeleteFile: (orgId: string, fileId: string) => Promise<Result<{ fileId: string }>>
// tenantDb transaction: stamps softDeletedAt + logAudit('file.soft_deleted')
// Not wired to UI; shipped for API completeness.
```

### `src/lib/files/cursor.ts`
```ts
export type FileCursor = { uploadedAt: string; id: string }   // iso datetime, uuid
export const encodeCursor: (cursor: FileCursor) => string     // base64url JSON
export const decodeCursor: (raw: string | null) => FileCursor | null  // Zod-validated; null on bad input
```

### `src/db/queries/file-metadata.ts`
```ts
export const getFile: (orgId: string, fileId: string) => Promise<FileMetadata | null>
export const getFileDownloadUrl: (orgId: string, fileId: string) =>
  Promise<Result<{ url: string; fileName: string; contentType: string }>>
// Signs GetObjectCommand with ResponseContentDisposition (RFC 5987), expiresIn: 600s
export const getSignedGetForKey: (args: { objectKey: string; expiresIn: number }) =>
  Promise<{ url: string }>
// Tenant-free helper for the export worker (no org row scope).
export const listFiles: (args: { orgId: string; cursor: string | null; limit?: number }) =>
  Promise<{ rows: FileMetadata[]; nextCursor: string | null }>
// Newest-first keyset: orderBy [uploadedAt desc, id desc], limit+1 trick, (uploadedAt,id) cursor
```

### `src/db/schema.ts` (fileMetadata table — new in ch069)
```ts
export const fileMetadata: PgTable  // table: file_metadata
  id: uuid PK ($defaultFn uuidv7)
  organizationId: text NOT NULL FK organization.id ON DELETE cascade
  uploadedBy: text FK user.id ON DELETE set null (nullable)
  objectKey: text NOT NULL UNIQUE('file_metadata_object_key_unique')
  originalFileName: text NOT NULL
  contentType: text NOT NULL
  byteSize: bigint(mode:'number') NOT NULL  CHECK >= 0
  uploadedAt: timestamptz DEFAULT now() NOT NULL
  softDeletedAt: timestamptz (nullable)
  INDEX idx_file_metadata_org_active ON (organizationId, softDeletedAt, uploadedAt DESC, id DESC)

export type FileMetadata = typeof fileMetadata.$inferSelect
export type NewFileMetadata = typeof fileMetadata.$inferInsert

// Pre-existing tables also exported:
export const emailSuppressions, suppressionReason, invoices, exports
export type EmailSuppression, NewEmailSuppression, Invoice, NewInvoice, ExportRow, NewExportRow
```

### `src/app/files/page.tsx`
```ts
// Server Component, dynamic (reads searchParams.cursor)
export default FilesPage: ({ searchParams: Promise<{ cursor?: string }> }) => JSX
// requireOrgUser() → listFiles({ orgId, cursor }) → maps rows through FileRow (per-row getFileDownloadUrl)
// Child: FileRow — async Server Component, signs fresh GET per render
// Keyset pagination: ?cursor=<base64url> → "Next page" link
```

### `src/app/files/upload-form.tsx`
```ts
// 'use client'
export const UploadForm: () => JSX
// States: 'idle' | 'signing' | 'uploading' | 'finalizing' | 'done' | 'failed'
// Flow: presignedPut(FormData) → XHR PUT to R2 (Content-Type header, xhr.upload.onprogress) → finalizeUpload(FormData) → router.refresh()
// Shows: file input (accept=ALLOWED_CLIENT_TYPES), Progress bar, status text, error message
```

### `src/app/api/exports/[runId]/route.ts`
```ts
export const GET: (request: Request, { params }: { params: Promise<{ runId: string }> }) => Promise<Response>
// Calls retrieveRun(runId) → JSON { status, metadata, attemptCount, completedAt, error }
// 502 on SDK error
```

### `src/lib/trigger-client.ts`
```ts
export type RunState = { status: string; metadata: Record<string, unknown>; output: unknown;
                         attemptCount: number; completedAt: Date | null; error: { message: string } | null }
export const retrieveRun: (runId: string) => Promise<RunState>
export const listRunsForOrg: (orgId: string) => Promise<{ id: string; status: string; tags: string[] }[]>
```

### `trigger/export-invoices.ts`
```ts
export const exportQueue: Queue  // queue({ name: 'export', concurrencyLimit: 1 })
export const exportInvoices: SchemaTask<
  { organizationId: string; requestedBy: string },
  { ok: boolean; runId: string; rowCount: number }
>
// id: 'export-invoices', retry: maxAttempts 3
// Body: countInvoices → abort if 0; page loop (paginatePage children, sequential)
//   → r2 PutObjectCommand Key=exports/org/${orgId}/${runId}.csv
//   → getSignedGetForKey({ expiresIn: 600 }) → metadata.set('downloadUrl')
//   → sendExportEmail.triggerAndWait (child, idempotency-keyed)
//   → tenantDb tx: update exports status=completed + logAudit('export.invoices.completed')
```

### `trigger/paginate-page.ts`
```ts
export const paginatePage: SchemaTask<
  { organizationId: string; page: number; cursor: string | null },
  { csv: string; nextCursor: string | null; rowCount: number }
>
// id: 'paginate-page'; listInvoices(pageSize=500) → rowsToCsv(rows)
```

### `trigger/send-export-email.ts`
```ts
export const sendExportEmail: SchemaTask<
  { organizationId: string; recipientUserId: string; rowCount: number; downloadUrl: string },
  Result<{ id: string }>
>
// id: 'send-export-email'
// tenantDb member lookup → sendEmail(ExportReadyEmail) → returns err (not throws) on suppression
```

### `src/emails/ExportReadyEmail.tsx`
```ts
export type ExportReadyEmailProps = { orgName: string; rowCount: number; downloadUrl: string }
export default ExportReadyEmail: (props: ExportReadyEmailProps) => JSX
ExportReadyEmail.PreviewProps: ExportReadyEmailProps
```

### `src/lib/exports/errors.ts`
```ts
export class ExportError extends Error {
  override readonly name: 'ExportError'
  readonly code: 'EMPTY_RESULTSET' | 'UNKNOWN_PLAN'
  constructor(code, message)
}
```

### `src/lib/exports/to-csv.ts`
```ts
// COLUMNS = ['id','number','customerName','status','total','currency','createdAt','dueAt'] as const
export const rowsToCsv: (rows: Invoice[]) => string  // RFC-4180 CRLF, header + data rows
```

### `src/lib/exports/day-bucket.ts`
```ts
export const dayBucket: () => string  // new Date().toISOString().slice(0, 10) — UTC YYYY-MM-DD
```

### `src/lib/exports/start.ts`
```ts
// 'use server' Server Action, role: 'member'
export const startExport: authedAction(
  'member',
  z.strictObject({}),
  async (_input, ctx) => Promise<Result<{ runId: string }>>
)
// insert exports row (queued) → tasks.trigger('export-invoices', ..., { concurrencyKey: orgId,
//   idempotencyKey: [orgId, userId, dayBucket()], idempotencyKeyTTL: '24h', tags: ['org:${orgId}'] })
// → update row with runId → revalidatePath('/inspector')
```

### `src/lib/result.ts`
```ts
export type ErrorCode = 'validation'|'conflict'|'not_found'|'unauthorized'|'forbidden'|'rate_limited'|'internal'
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; userMessage: string; fieldErrors?: Record<string, string[]> } }
export const ok: <T>(data: T) => Result<T>
export const err: (code: ErrorCode, userMessage: string, fieldErrors?) => Result<never>
export const isUniqueViolation: (e: unknown) => boolean  // checks cause.code === '23505'
```

### `src/components/ui/progress.tsx`
```ts
export function Progress(props: React.ComponentProps<typeof ProgressPrimitive.Root>): JSX
// Radix Progress primitive, translates value 0–100 to translateX CSS
```

### `src/components/ui/badge.tsx`
```ts
export const badgeVariants: CVA  // variants: default | secondary | destructive | outline | ghost | link
export function Badge(props: ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }): JSX
```

### `trigger.config.ts`
```ts
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_placeholder',
  dirs: ['./trigger'],
  runtime: 'node',
  maxDuration: 300,
  retries: { default: { maxAttempts: 3, factor: 1.8, minTimeoutInMs: 1000, maxTimeoutInMs: 60_000, randomize: true } }
})
```

### `drizzle/0008_add_file_metadata.sql`
Creates `file_metadata` table with columns id, organization_id, uploaded_by, object_key (UNIQUE), original_file_name, content_type, byte_size (bigint, CHECK >= 0), uploaded_at, soft_deleted_at. FK to organization (CASCADE) and user (SET NULL). Composite index `idx_file_metadata_org_active` on (organization_id, soft_deleted_at, uploaded_at DESC, id DESC).

## Dependencies

From `package.json` (name: `chapter-069-presigned-r2-upload`):

**Runtime dependencies:**
| Package | Version |
|---|---|
| `@aws-sdk/client-s3` | ^3.1065.0 |
| `@aws-sdk/s3-request-presigner` | ^3.1065.0 |
| `@t3-oss/env-nextjs` | ^0.13.11 |
| `@trigger.dev/sdk` | ^4.0.0 |
| `better-auth` | ^1.6.14 |
| `class-variance-authority` | ^0.7.1 |
| `clsx` | ^2.1.1 |
| `drizzle-orm` | ^0.45.1 |
| `lucide-react` | ^1.17.0 |
| `next` | 16.2.7 |
| `next-themes` | ^0.4.6 |
| `pino` | ^9.14.0 |
| `postgres` | ^3.4.7 |
| `radix-ui` | ^1.4.3 |
| `react` | 19.2.4 |
| `react-dom` | 19.2.4 |
| `react-email` | ^6.5.0 |
| `resend` | ^6.12.4 |
| `server-only` | ^0.0.1 |
| `sonner` | ^2.0.7 |
| `tailwind-merge` | ^3.6.0 |
| `tw-animate-css` | ^1.4.0 |
| `uuidv7` | ^1.0.2 |
| `zod` | ^4.4.3 |

**Dev dependencies:**
| Package | Version |
|---|---|
| `@biomejs/biome` | 2.4.16 |
| `@react-email/ui` | ^6.5.0 |
| `@tailwindcss/postcss` | ^4.3.0 |
| `@types/node` | ^25.9.1 |
| `@types/react` | ^19.2.16 |
| `@types/react-dom` | ^19.2.3 |
| `auth` | ^1.6.14 |
| `babel-plugin-react-compiler` | 1.0.0 |
| `dotenv-cli` | ^10.0.0 |
| `drizzle-kit` | ^0.31.5 |
| `drizzle-seed` | ^0.3.1 |
| `drizzle-zod` | ^0.8.0 |
| `tailwindcss` | ^4.3.0 |
| `trigger.dev` | ^4.0.0 |
| `tsx` | ^4.20.0 |
| `typescript` | ^6.0.3 |
| `vitest` | ^4.1.8 |

## Start diff

The start and solution directories have identical file trees. All differences are stub → implementation replacements. The start contains 6 TODO comments; the solution has none.

**Files identical between start and solution** (representative, not exhaustive): `env.ts`, `src/lib/r2.ts`, `src/lib/files/keys.ts`, `src/lib/files/errors.ts`, `src/lib/files/soft-delete.ts`, `src/lib/files/cursor.ts`, `src/db/schema.ts`, `trigger/paginate-page.ts`, `trigger/send-export-email.ts`, `src/lib/exports/errors.ts`, `src/lib/exports/to-csv.ts`, `src/lib/exports/day-bucket.ts`, `src/lib/exports/start.ts`, `src/app/api/exports/[runId]/route.ts`, `src/lib/trigger-client.ts`, `src/components/ui/badge.tsx`, `src/components/ui/progress.tsx`, `src/emails/ExportReadyEmail.tsx`, `src/app/files/loading.tsx`.

**Files changed (start → solution):**

- **`src/lib/files/presigned-put.ts`** — Start: stub returning `err('internal', 'Not implemented')`. Solution: full implementation using `uuidv7()`, `buildObjectKey()`, `getSignedUrl(PutObjectCommand)` with `signableHeaders: content-type`, `expiresIn: 300`, returns `ok({ uploadId, url, objectKey })`.
  - TODO: `TODO(L2) — uploadId = uuidv7(); objectKey = buildObjectKey(...); getSignedUrl over PutObjectCommand(...) signableHeaders content-type, expiresIn 300; return ok({ uploadId, url, objectKey }); NO db write`

- **`src/lib/files/finalize.ts`** — Start: stub returning `err('internal', 'Not implemented')`. Solution: `HeadObjectCommand` (404 → `object-not-found`), asserts `ContentType` match and `ContentLength ≤ MAX_BYTES` (else `size-mismatch`), `tenantDb(orgId).transaction` inserts `fileMetadata` row from HEAD-observed values + `logAudit('file.uploaded')`, handles unique violation → `conflict`.
  - TODO: `TODO(L3) — HeadObjectCommand (404→object-not-found); assert head.ContentType===contentType and head.ContentLength<=MAX_BYTES (else size-mismatch); tenantDb(orgId).transaction: insert row (id=uploadId, byteSize/contentType from HEAD, uploadedBy) + logAudit file.uploaded; return ok({ fileId })`

- **`src/db/queries/file-metadata.ts`** — Start: stub throwing `new Error('not implemented')` for all four functions. Solution: full implementations of `getFile`, `getFileDownloadUrl` (RFC 5987 `ResponseContentDisposition`, `expiresIn: 600`), `getSignedGetForKey` (tenant-free, for worker use), and `listFiles` (composite keyset cursor, `limit+1` trick, newest-first).
  - TODO: `TODO(L4) — getFile/getFileDownloadUrl (isNull(softDeletedAt), RFC5987 ResponseContentDisposition, expiresIn 600) / getSignedGetForKey (tenant-free, raw key) / listFiles (orderBy [uploadedAt desc, id desc], limit+1 keyset cursor)`

- **`src/app/files/upload-form.tsx`** — Start: empty shell `<div data-testid="upload-form" />`. Solution: full `UploadForm` client component with status state machine (`idle|signing|uploading|finalizing|done|failed`), `Progress` bar, XHR PUT with `onprogress`, client-side allowlist pre-checks, calls `presignedPut` → `putToR2` → `finalizeUpload` → `router.refresh()`.
  - TODO: `TODO(L3) — file input (accept allowlist) + status state + progress; presignedPut → XMLHttpRequest PUT (Content-Type header, xhr.upload.onprogress) → finalizeUpload → router.refresh()`

- **`src/app/files/page.tsx`** — Start: calls `requireOrgUser()` and renders a static "No files yet." shell with the stub `UploadForm`. Solution: full page with `listFiles({ orgId, cursor })`, maps rows to `FileRow` async components (each calls `getFileDownloadUrl`), renders file name, type badge, size, timestamp, download link, and keyset "Next page" link.
  - TODO (two): `TODO(L3) — mount UploadForm above the list; TODO(L4) — listFiles + per-row fresh getFileDownloadUrl, render file-row table + Next-page cursor link; NO audit write in render; NEVER 'use cache'`

- **`trigger/export-invoices.ts`** — Start: after the page loop, hardcodes `downloadUrl = 'https://example.com/exports/${ctx.run.id}.csv'` as a placeholder. Solution: replaces the placeholder with `r2.send(PutObjectCommand({ Key: exports/org/${orgId}/${runId}.csv, Body: Buffer.from(csv), ContentType: 'text/csv', ContentDisposition }))` → `getSignedGetForKey({ objectKey, expiresIn: 600 })` → `metadata.set('downloadUrl', downloadUrl)`. Also adds `import { PutObjectCommand } from '@aws-sdk/client-s3'` and `import { getSignedGetForKey } from '@/db/queries/file-metadata'` and `import { BUCKET, r2 } from '@/lib/r2'`.
  - TODO: `TODO(L5) — after the page loop: Buffer.from(csv); r2.send(PutObjectCommand({ Key: exports/org/${orgId}/${ctx.run.id}.csv, Body, ContentType text/csv, ContentDisposition })); getSignedGetForKey({ objectKey, expiresIn: 600 }) → metadata.set('downloadUrl') → sendExportEmail; NO file_metadata row; PUT before the close-out txn`
