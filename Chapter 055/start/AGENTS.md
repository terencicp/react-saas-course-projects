# AGENTS.md

Email + password authentication with verification (forked from Chapter 050). The
Better Auth `auth` instance (`lib/auth.ts`) is the single seam: the proxy gates on
cookie presence, the protected layout validates the read, and the Server Actions
authorize. One catch-all route (`api/auth/[...all]`) mounts the library handler; a
purpose-built React Email template rides the carried-in `sendEmail` pipeline for
the verification mail. Deliberately one flow — two auth-page groups, one protected
group, one catch-all route — so the structural lesson lands without app-feature
noise. No OAuth, passkeys, 2FA, magic links, or password reset.

## Stack core (May 2026)

Next.js 16 (App Router, Cache Components, proxy) · React 19 · TypeScript · Tailwind
v4 (CSS-first) · shadcn/ui · next-themes · Zod 4 · Better Auth (Drizzle adapter) ·
Drizzle ORM 0.45 (postgres-js driver) · Postgres 18 (Docker) · Resend · React
Email 6 · sonner.

## Repo layout

- `src/app/` — App Router: root `layout.tsx` (mounts `<Toaster/>`, literal app-name
  metadata), `page.tsx` (redirects to `/sign-in`), `globals.css`, `_components/`
  (providers, the shared `SubmitButton` + `FieldError`). `(auth)/` holds the
  `sign-up`, `sign-in`, and `verify-email` route groups (page shell + client form +
  action per group; the `await searchParams` pages carry a `loading.tsx` Suspense
  seam). `(protected)/` holds the gated `layout.tsx`, `dashboard/`, and
  `sign-out-action.ts`. `api/auth/[...all]/route.ts` is the one catch-all handler.
- `src/proxy.ts` — the request-time gate (sibling of `app/`, NOT the repo root):
  cookie-presence redirect for `/dashboard`, inverse gate for the auth pages.
- `src/components/ui/` — shadcn primitives (`button`, `card`, `input`, `label`,
  `separator`, `skeleton`, `sonner`).
- `src/db/` — `index.ts` (the `db` client, snake_case casing), `columns.ts`,
  `schema.ts` (`email_suppressions` + enum), `schema/auth.ts` (the CLI-generated
  `user`/`session`/`account`/`verification` tables).
- `src/emails/` — `welcome-verification.tsx` (the verification template +
  `PreviewProps`), `email-tailwind-config.ts`, `components/email-layout.tsx`. Files
  here import each other with same-folder **relative** paths and read NO env/DB.
- `src/lib/` — `auth.ts` (the `auth` instance + `SESSION_COOKIE_PREFIX` + the cached
  `getSession`/`getCurrentUser`/`requireUser` ladder), `auth-schema.config.ts`
  (the CLI-only, server-only-free generator config), `auth-client.ts`
  (`createAuthClient()`), `auth/error-mapping.ts` (`mapAuthError` → 7-code Result),
  `redirects.ts` (`safeNext`), `result.ts`, `suppressions.ts`, `email.ts`,
  `utils.ts`.
- `src/env.ts` — the only env boundary (`@t3-oss/env-nextjs`).
- `scripts/seed.ts` — the deterministic seed (clears suppressions, no rows);
  `scripts/test-lesson.mjs` runs one lesson test.
- `tests/lessons/` — one `Lesson <n>.test.ts` per implementation lesson.

## Daily commands

- `docker compose up -d` — start local Postgres 18.
- `pnpm auth:generate` — generate the four-table auth Drizzle schema (CLI config
  is `src/lib/auth-schema.config.ts`, NOT `lib/auth.ts`).
- `pnpm db:generate` — generate a migration from the schema (pass `--name <verb>_<noun>`).
- `pnpm db:migrate` — apply migrations to the local DB.
- `pnpm db:seed` — run the deterministic seed.
- `pnpm db:studio` — open Drizzle Studio.
- `pnpm dev` — run the dev server.
- `pnpm email` — run the React Email preview server on port 3001 (`--dir ./src/emails`).
- `pnpm build` — production build.
- `pnpm check` — Biome format + lint + organize imports (writes).
- `tsc --noEmit` — typecheck.
- `pnpm verify` — Biome CI + typecheck + build (the gate; needs the env set).
- `pnpm test:lesson <n>` — run a single lesson test.

## Conventions

Code style is enforced by `biome.json`; TypeScript strictness by `tsconfig.json`;
editor settings by `.editorconfig`. The `auth` instance is the single seam; the
proxy gates on cookie presence only (no authz decision), the layout validates, the
action authorizes. `nextCookies()` is last in `plugins`. Email templates are pure
renderers — no env/DB/session reads. Enumeration discipline is whole-path: no
taken-email branch, opaque sign-in errors, uniform resend.
