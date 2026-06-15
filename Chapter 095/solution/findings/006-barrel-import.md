# Finding 006 — `lucide-react` barrel import ships the whole icon set on every authenticated page

**Category:** Bundle size — the barrel-export trap + the Turbopack analyzer (chapter 094, lessons 3/4).
**Severity:** high — the cost rides on the `(protected)` layout, so it lands on *every* authenticated page, and it is JavaScript the client must parse and execute before the nav is interactive (INP risk on slow mobile). Not critical because the page renders correctly and the fix is one config line, but it is the heaviest single avoidable weight in the authenticated bundle.

## Rule

A barrel import (`import { Home, FileText } from 'lucide-react'`) pulls the package's entire entry module — and therefore every re-exported icon — into the bundle when the bundler can't tree-shake it, so the build must be told to rewrite the import to per-icon module paths (chapter 094, lessons 3/4 — `the barrel-export trap` and `the Turbopack analyzer`). `experimental.optimizePackageImports` is the team-level seam: one config entry rewrites every barrel import of that package across the app, with no churn at the call sites.

## Location

- `src/app/(protected)/layout.tsx`, lines 1–13 — the nav imports ~a dozen icons (`Bell`, `Building2`, `CreditCard`, `FileText`, `HelpCircle`, `Home`, `LayoutDashboard`, `LogOut`, `Search`, `Settings`, `Users`) from the `lucide-react` **barrel**.
- `next.config.ts` — the missing list entry: `lucide-react` was absent from `experimental.optimizePackageImports`, so nothing rewrote the barrel.

How it surfaced — the diagnostic surface is the analyzer treemap, not source. Run the Turbopack analyzer and open the report:

```
pnpm next experimental-analyze
```

It writes the treemap under `.next/diagnostics/analyze`. **Before** the fix a single `lucide-react` tile dominates the authenticated route's client bundle at roughly 600 KB — the whole icon set, not the dozen glyphs the nav uses. That oversized tile is the fingerprint; the grep below confirms the missing config entry:

```
rg -n "optimizePackageImports" next.config.ts
```

## Consequence

Roughly **570 KB** of icon code the app never renders ships on every authenticated page — the dozen used glyphs are a few KB, the rest is dead weight the browser still downloads, parses, and executes. Operator- and user-visible: a heavier main-thread parse before the nav is interactive, which shows up as INP regression on slow mobile devices (the budget is INP ≤ 200ms at p75), and wasted bytes on every authenticated navigation. Because the import lives in the shared `(protected)` layout, the cost is multiplied across the whole authenticated surface, not isolated to one route.

## Fix

This is the one in-place performance fix in the audit (slice S5) — the line is added to `next.config.ts`:

```ts
experimental: { optimizePackageImports: ['lucide-react'] },
```

The seam rewrites every `lucide-react` barrel import to its per-icon module path at build, so only the referenced glyphs reach the bundle — the call sites in `layout.tsx` are untouched. This is the senior default over hand-converting each import to `lucide-react/dist/esm/icons/<icon>` per icon: per-icon imports work but are churn the next icon addition re-introduces, while the config entry is the single place the rule is configured (the "one seam" pattern). For an internal package the team owns, `sideEffects: false` in its `package.json` is the complementary lever — it tells the bundler the modules are tree-shakeable so a barrel re-export drops unused exports without needing `optimizePackageImports` at all.

After the fix, re-run `pnpm next experimental-analyze` and compare the treemap: the `lucide-react` tile collapses to the handful of used icons.

**Before / after the fix (the analyzer treemap, captured by the by-hand analyzer run):**

![lucide-react barrel before the fix — the full icon set dominates the bundle](./screenshots/before-barrel.png)

![lucide-react after `optimizePackageImports` — only the used icons remain](./screenshots/after-barrel.png)

Half-credit converts the call sites to per-icon imports (it shrinks the bundle but is per-call-site churn); full credit names `optimizePackageImports` as the single seam, with `sideEffects: false` as the internal-package companion.
