# AGENTS.md

A static, themed marketing surface — the from-scratch toolchain project that every later project carries forward.

## Stack core (May 2026)

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 (CSS-first) · shadcn/ui · next-themes.

## Repo layout

- `src/app/` — App Router: `layout.tsx`, `page.tsx`, `globals.css`, `_components/providers.tsx`.
- `src/components/` — section components; `src/components/ui/` holds shadcn primitives.
- `src/hooks/` — custom hooks.
- `src/lib/` — `data.ts` fixtures and `utils.ts` (`cn()`).
- `tests/lessons/` — one `Lesson <n>.test.ts` per implementation lesson; `scripts/test-lesson.mjs` runs one file.
- `public/` — static assets.

## Daily commands

- `pnpm dev` — run the dev server.
- `pnpm build` — production build.
- `pnpm check` — Biome format + lint + organize imports (writes).
- `tsc --noEmit` — typecheck.
- `pnpm verify` — Biome CI + typecheck + build (the gate).
- `pnpm test:lesson <n>` — run a single lesson test.

## Conventions

Code style is enforced by `biome.json`; TypeScript strictness by `tsconfig.json`; editor settings by `.editorconfig`.
