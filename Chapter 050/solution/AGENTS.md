# AGENTS.md

The welcome-email send path (forked from Chapter 047): one real transactional send wired end-to-end. A suppression-gated, idempotency-keyed `sendEmail` seam (`lib/email.ts`) is the single side-effect boundary every email flows through; a pure props-only React Email template (`emails/welcome.tsx`) renders identically in preview, test, and production; a five-seam Server Action (`app/actions/send-welcome.tsx`) parses first and returns a `Result`. A provided inspector route fires the action and shows a server-rendered preview iframe. Deliberately minimal — one route, one template, one action, one wrapper.

## Stack core (May 2026)

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 (CSS-first) · shadcn/ui · next-themes · Zod 4 · Drizzle ORM 0.45 (postgres-js driver) · Postgres 18 (Docker) · Resend · React Email 6 · sonner.

## Repo layout

- `src/app/` — App Router: root `layout.tsx` (mounts `<Toaster/>`, literal app-name metadata), `page.tsx` (redirects to `/inspector/send-welcome`), `globals.css`, `_components/` (providers, the shared `SubmitButton` + `FieldError`); `inspector/send-welcome/` (the provided server `page.tsx` with the form + email-preview iframe, and the `send-welcome-form.tsx` client form); `actions/send-welcome.tsx` (the `sendWelcomeEmail` action).
- `src/components/ui/` — shadcn primitives (`button`, `card`, `separator`, `skeleton`, `input`, `label`, `sonner`).
- `src/db/` — `index.ts` (the `db` client, snake_case casing), `columns.ts`, `schema.ts` (organizations, users, email_suppressions — the single source of truth).
- `src/emails/` — `welcome.tsx` (the `WelcomeEmail` template + `PreviewProps`), `email-tailwind-config.ts` (`emailTailwindConfig`, `pixelBasedPreset` + brand tokens), `components/email-layout.tsx` (brand chrome). Files here import each other with same-folder **relative** paths and read NO env/DB — the preview server runs them in its own working dir.
- `src/lib/` — `result.ts` (the `Result<T>` contract + `ok`/`err`/`isUniqueViolation`), `auth-stub.ts` (`getActiveContext` — a fixed org+user by natural key), `suppressions.ts` (`isSuppressed`), `email.ts` (the `sendEmail` wrapper), `utils.ts` (`cn`).
- `src/env.ts` — the only env boundary (`@t3-oss/env-nextjs`); application code imports `env`, never `process.env`.
- `scripts/seed.ts` — the deterministic seed (org + user + one suppressed row); `scripts/test-lesson.mjs` runs one lesson test.
- `tests/lessons/` — one `Lesson <n>.test.ts` per implementation lesson.

## Daily commands

- `docker compose up -d` — start local Postgres 18.
- `pnpm db:generate` — generate a migration from the schema (pass `--name <verb>_<noun>`).
- `pnpm db:migrate` — apply migrations to the local DB.
- `pnpm db:seed` — run the deterministic seed.
- `pnpm db:studio` — open Drizzle Studio.
- `pnpm dev` — run the dev server.
- `pnpm email` — run the React Email preview server on port 3001 (`--dir ./src/emails`).
- `pnpm build` — production build.
- `pnpm check` — Biome format + lint + organize imports (writes).
- `tsc --noEmit` — typecheck.
- `pnpm verify` — Biome CI + typecheck + build (the gate; needs `DATABASE_URL` set).
- `pnpm test:lesson <n>` — run a single lesson test.

## Conventions

Code style is enforced by `biome.json`; TypeScript strictness by `tsconfig.json`; editor settings by `.editorconfig`. Email templates and layout are pure renderers — no env/DB/session reads; the action computes per-send values and passes props.
