# React SaaS Course — Project Codebases

The hands-on project codebases for the **React SaaS course** — a full-depth course on building a production SaaS with the minimum-viable 2026 stack (TypeScript, React 19, Next.js 16, Postgres + Drizzle, Better Auth, Stripe, and more). The course itself (lessons, the authoring pipeline) lives in the separate [`react-saas-course`](https://github.com/terencicp/react-saas-course) repo; this repo is just the code you build chapter by chapter.

## Layout

One folder per project chapter, each with two copies of the same app:

```
Chapter NNN/
  start/      the starter — student-owned bodies stubbed with // TODO(L<n>) markers
  solution/   the finished reference implementation
```

- **`start/`** is where you code. Run `rg "TODO\(L" src` inside it to enumerate the work for each lesson.
- **`solution/`** is the answer key — the completed app the lessons build toward.

Each project is a self-contained Next.js app with its own `pnpm` workspace and lockfile; there is no root-level workspace. Every project folder also ships its own `README.md` (in `start/`) and `AGENTS.md` describing that specific app — **read those for project-level detail.**

The lessons that drive each project live in the course repo, under `src/content/docs/`. A `Chapter NNN/` folder here maps to the `NNN Project - <name>/` lesson folder there — that's where the step-by-step instructions, screenshots, and the spec behind each stub live.

## The projects

Projects chain: most starters are derived from an earlier chapter's solution, so the app grows across the course. Each `start/README.md` states what its chapter builds on.

| Chapter | Unit | Project |
| --- | --- | --- |
| 028 | 3 — React & Tailwind | Themed product surface, built from scratch on a Next.js 16 + shadcn/ui scaffold |
| 035 | 4 — App Router | List-plus-detail surface with parallel routes and the modal-with-real-URL pattern |
| 041 | 5 — Postgres & Drizzle | The org-scoped invoicing data layer (schema, relations, migrations, seeds) |
| 047 | 6 — Server Actions | Full CRUD on the invoicing data layer via Server Actions |
| 050 | 7 — Email | The welcome-email send path (React Email template through Resend) |
| 055 | 8 — Auth | End-to-end email + password auth flow with verification (Better Auth) |
| 059 | 9 — Orgs & RBAC | Organizations, roles, and invitations wired end-to-end |
| 062 | 10 — Lists & URL state | The production list view: URL-driven filters, sorting, pagination, archive/restore |
| 065 | 11 — Stripe billing | A Stripe webhook pipeline projecting subscription events into plan entitlements |
| 067 | 12 — Background work | A durable CSV export job on Trigger.dev |
| 069 | 12 — Object storage | A presigned-URL upload flow to Cloudflare R2 |
| 071 | 13 — Notifications | A notification dispatcher fanning events across email + in-app inbox |
| 073 | 14 — Caching | Tag-driven cache invalidation on the invoices list |
| 075 | 14 — Rate limiting | Upstash rate limits on the auth surface |
| 077 | 15 — TanStack Query | A polling, infinite-scrolling optimistic comment thread |
| 079 | 15 — Zustand | A routed multi-step customer wizard |
| 082 | 16 — Errors & security | A pre-launch audit pass hardening errors, headers, and the security baseline |
| 085 | 17 — i18n | A tri-locale invoices list with localized dates, numbers, and currency |
| 091 | 18 — Testing | A layered test suite (unit + integration + E2E) for the Stripe money path |
| 095 | 19 — Observability | Sentry, Pino, PostHog, and Vercel Analytics wired, then a Core Web Vitals audit |
| 100 | 20 — Deploy & migrate | Ship to production, then run a live expand-migrate-contract schema change |
| 104 | 21 — Docs & review | Review a real PR through the five-layer review stack and write the ADR |
| 108 | 22 — AI | An "ask-your-invoices" chat with tool calling and per-user token quotas |

## Running a project

There is nothing to run at the repo root. Pick a chapter and a copy, then work inside it. Requires Node 24+ and pnpm.

```bash
cd "Chapter 028/start"   # or .../solution
pnpm install
pnpm dev                 # dev server
pnpm verify              # Biome CI + typecheck + build (the gate)
pnpm test:lesson <n>     # run a single lesson's verification file
```

Some projects need extra setup — a local Postgres (`docker compose up -d`), a `.env`, migrations and seeds, or third-party API keys. The project's own `README.md`/`AGENTS.md` spells out exactly what each one needs.

## How `tests/lessons/` works

Each project ships a `tests/lessons/` folder holding one `Lesson <n>.test.ts` per implementation lesson — the same files in both `start/` and `solution/`. These tests **are the spec you code against**: a lesson hands you a stub to fill in, and its test renders what you just built and checks the structural requirements (the right markup, the right responsive cut, the right data wired through).

Every build-it-yourself lesson ends with a "Moment of truth" — run that lesson's file and watch it go green:

```bash
pnpm test:lesson 6        # runs tests/lessons/Lesson 6.test.ts
```

The suites run in Node with no real browser, so anything they can't catch (keyboard focus order, visual reflow) the lesson lists as a by-eye checklist against `pnpm dev`. When the lesson's test passes, finish with `pnpm verify` — the full gate that adds Biome, typecheck, and a production build on top.

## Tooling

Every project uses the same toolchain: **pnpm** (enforced), **Biome** for format + lint, **Vitest** for the per-lesson tests under `tests/lessons/`, and TypeScript strict mode. Style and strictness are pinned per project by `biome.json`, `tsconfig.json`, and `.editorconfig`.
