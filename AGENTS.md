# AGENTS.md

The per-chapter project codebases for the React SaaS course (the lessons and authoring pipeline live in the sibling `react-saas-course` repo). Stack thesis: the minimum-viable 2026 SaaS stack — React 19, Next.js 16, TypeScript, no historical detours.

## Structure

One folder per project chapter, each holding two copies of the same app:

```
Chapter NNN/
  start/      student starter — owned bodies stubbed with // TODO(L<n>) markers
  solution/   completed reference implementation
```

There is **no root workspace**: each `start/` and `solution/` is an independent Next.js app with its own `pnpm-workspace.yaml`, `package.json`, and lockfile. Always operate inside a specific project folder, never the repo root.

Every project folder carries its own `AGENTS.md` (and `start/README.md`) describing that app's seams, layout, and gotchas. **That per-project `AGENTS.md` is the source of truth for the project — read it before touching the code.** Do not duplicate its content here.

The lessons that specify each project live in the sibling `react-saas-course` repo under `src/content/docs/`: a `Chapter NNN/` folder here maps to the `NNN Project - <name>/` lesson folder there. When a stub's intended behavior is unclear, that lesson — and its `tests/lessons/Lesson <n>.test.ts` — is the spec.

## Cross-project consistency

Projects form a chain: most starters are derived from an earlier chapter's `solution/` (e.g. `108 ← 062`, `100 ← 062 ← 059 ← 055 ← …`). A given chapter's `start/README.md` names what it builds on. A change to shared code (schema, auth, the invoices surface) may need to be carried forward consistently across the chain — check before assuming a project is isolated.

Within one chapter, `start/` and `solution/` are the same app at two points in time: `solution/` is `start/` with the `// TODO(L<n>)` bodies filled in. Keep them aligned — a fix to one usually belongs in the other.

## Tooling and commands

Uniform across projects. Run from inside a project folder:

- `pnpm install` — install deps (**pnpm only**; a `preinstall` guard rejects npm/yarn).
- `pnpm dev` — dev server.
- `pnpm check` — Biome format + lint + organize imports (writes).
- `pnpm verify` — Biome CI + typecheck + build. This is the gate; make it pass.
- `pnpm test:lesson <n>` — run a single lesson's verification file from `tests/lessons/`.

`tests/lessons/Lesson <n>.test.ts` is the spec each implementation lesson grades against (identical in `start/` and `solution/`): make the code satisfy the test, don't weaken the test to satisfy the code.

Code style is enforced by `biome.json`, TypeScript strictness by `tsconfig.json`, editor settings by `.editorconfig` — follow them, don't override.

## Setup-heavy projects

Some projects need more than `pnpm install` to run: a local Postgres (`docker compose up -d`), a `.env` (`cp .env.example .env`), migrations + seeds (`pnpm db:migrate && pnpm db:seed`), or third-party keys (Stripe, Resend, R2, AI Gateway). The project's own README/AGENTS lists exactly what each needs. Tests and the `verify` gate are designed to run without live external services.
