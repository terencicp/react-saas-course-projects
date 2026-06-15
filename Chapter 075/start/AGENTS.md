# AGENTS.md

Upstash rate limits on the email + password auth surface (forked from Chapter 055).
Three `@upstash/ratelimit` limiters (`lib/rate-limit.ts` — the ONLY place
`new Ratelimit(...)` appears) gate the auth **Server Actions**: sign-in (per-IP +
per-email), sign-up (per-IP), reset (per-IP + per-email). `safeLimit` is the single
fail-open knob; the budget rides the action `Result` (no HTTP headers on the action
path — `headers()` is read-only); Better Auth's built-in limiter is off, so the
application-level limiters are the single enforcement point. A provided `/inspector`
drives every observation. Literal `RateLimit-*` headers exist only on the
route-handler twin (`/api/limit-demo`); the catch-all `/api/auth/[...all]` stays
unwrapped.

## Stack core (May 2026)

Next.js 16 (App Router, Cache Components, proxy) · React 19 · TypeScript · Tailwind
v4 (CSS-first) · shadcn/ui · next-themes · Zod 4 · Better Auth (Drizzle adapter) ·
Drizzle ORM 0.45 (postgres-js driver) · Postgres 18 (Docker) · Resend · React
Email 6 · sonner · `@upstash/ratelimit` + `@upstash/redis`.

## Repo layout

- `src/app/` — App Router. `(auth)/` holds `sign-up`, `sign-in`, `verify-email`, and
  the new `reset/` route group (page shell + client form + action per group; the
  success path returns `ok({ redirectTo, rateLimit })` and the form navigates
  client-side — sign-in/sign-up — while reset shows an enumeration-uniform
  confirmation). `(protected)/` holds the gated `layout.tsx`, `dashboard/`, and
  `sign-out-action.ts`. `api/auth/[...all]/route.ts` is the unwrapped catch-all;
  `api/limit-demo/route.ts` is the route-handler twin (the only `RateLimit-*`
  headers). `inspector/` is the provided observation surface (page + loading +
  actions + `_components/`).
- `src/proxy.ts` — the request-time cookie-presence gate (sibling of `app/`).
- `src/components/ui/` — shadcn primitives.
- `src/db/` — `index.ts` (the `db` client, snake_case casing), `columns.ts`,
  `schema.ts` (`email_suppressions` + the new `rate_limit_log` table + enum),
  `schema/auth.ts` (the CLI-generated auth tables).
- `src/emails/` — the verification template; pure renderers, no env/DB reads.
- `src/lib/` — `auth.ts` (the `auth` instance + the cached `getSession` ladder; the
  `rateLimit: { enabled: false }` line is the only `rateLimit` entry), `email.ts`
  (carried `sendEmail` + the inspector mock mode), `rate-limit.ts` (the three
  module-scope `Ratelimit` instances + `LIMITER_MAX`), `redis.ts` (`Redis.fromEnv()`
  + `pingRedis`), `keys.ts` (`getClientIp`/`normalizeEmail`), `safe-limit.ts` (the
  fail-open wrapper), `rate-limit-headers.ts` (`rateLimitBudget`/`rateLimited`/the
  route-twin `rateLimitHeaders`/`rateLimitedResponse`), `rate-limit-log.ts`
  (`logRateLimit` → `rate_limit_log`), `redis-mock.ts` (the force-down mock),
  `result.ts`, `redirects.ts`, `suppressions.ts`, `utils.ts`.
- `src/env.ts` — the only env boundary; adds the two Upstash REST keys.
- `scripts/seed.ts` — the three-user verified seed (`alice`/`bob`/`eve`).
- `tests/lessons/` — one `Lesson <n>.test.ts` per implementation lesson.

## Daily commands

- `docker compose up -d` — start local Postgres 18.
- `pnpm auth:generate` — generate the four-table auth Drizzle schema.
- `pnpm db:generate` — generate a migration (pass `--name <verb>_<noun>`).
- `pnpm db:migrate` — apply migrations to the local DB.
- `pnpm db:seed` — run the deterministic three-user seed.
- `pnpm db:studio` — open Drizzle Studio.
- `pnpm dev` — run the dev server.
- `pnpm email` — run the React Email preview server on port 3001.
- `pnpm build` — production build.
- `pnpm check` — Biome format + lint + organize imports (writes).
- `tsc --noEmit` — typecheck.
- `pnpm verify` — Biome CI + typecheck + build (the gate; needs the env set).
- `pnpm test:lesson <n>` — run a single lesson test.

## Conventions

Code style is enforced by `biome.json`; TypeScript strictness by `tsconfig.json`. The
limiter is a named seam — `lib/rate-limit.ts` is the one place `new Ratelimit(...)`
appears; call sites import `signInLimiter` / `signUpLimiter` / `resetLimiter`. Gate
before work, dual-keyed where it matters, cheaper first (parse → resolve ip+email →
`safeLimit` gate(s) → `auth.api.*` → return). `safeLimit` is the one place the
fail-open policy lives. The budget rides the `Result`, never HTTP headers (the action
path); `pending` flushes via `after()`, never `await` on the path. The opaque 429
message is identical regardless of which gate tripped; the honest gate + key land
only in `rate_limit_log`.
