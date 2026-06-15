# Finding 007 — Hero LCP image ships without `preload`

**Category:** LCP / Core Web Vitals (chapter 094, lesson 2).
**Severity:** high — the marketing page is the unauthenticated first impression and the route Google Search scores; an LCP regression past the 2.5s threshold costs ranking and conversion on the highest-traffic surface. Not critical because no data is lost and the page renders correctly — it is slow, not broken.

## Rule

The Largest Contentful Paint element gets the eager-load hint exactly once per page so the browser fetches it during document parse instead of discovering it at layout (chapter 094, lesson 2 — `preload on the LCP element`). In Next.js 16 the `next/image` prop is `preload`; `priority` is the deprecated alias for the same behavior (it still disables lazy loading, emits `fetchpriority="high"`, and adds the image to the preload list). One `preload` per page — a second splits the browser's high-priority budget and neither image lands sooner.

## Location

`src/app/(marketing)/page.tsx`, the hero `<Image>` at lines 21–27: it ships `src`, `alt`, `width={1280}`, and `height={720}` — the CLS-safe dimensions are present — but carries no `preload` (nor the deprecated `priority`), so the browser lazy-loads the LCP element.

How it surfaced — the audit method this finding sets for every later one: open the running app, hold it beside the source, read one finding's fingerprint, write it before moving on. Here the running app names the defect faster than source. Load `/` with the Chrome DevTools Performance panel recording: the LCP marker lands on the hero `<Image>` at roughly 4s, and the Network panel shows the hero with Initiator "Parser" but a low priority and a late start — discovered at layout, not during parse. Confirm in source with a grep:

```
rg -n "<Image" "src/app/(marketing)/page.tsx"
```

The match is the hero; reading its props confirms the eager-load prop is absent. A raw `<img>` would have escaped the grep entirely, which is why the running-app LCP marker is the primary surface and the grep is the source-side confirmation.

## Consequence

The browser does not discover the hero image until it computes layout, adding roughly 200–600ms on a real connection before the fetch even starts; the recorded LCP lands near 4s, past the 2.5s "good" threshold at p75. User-visible, with the timing: the headline and call-to-action paint while the largest element — the product screenshot the marketing page is built around — arrives late, so the first impression is a half-rendered page on the slowest visitor connections (mobile on a flaky network, which dominates p75). Because Google scores LCP at the 75th percentile of real traffic over a rolling 28-day window, the regression is search-ranking exposure on the most-indexed route, and it lags two weeks in the field data so it is invisible until it has already cost rankings.

## Fix

Documented, not patched — the marketing page keeps the defect so the surface stays readable for the lesson. The senior reach is three layers:

1. **The eager-load hint.** Add `preload` to the hero `<Image>` — the one LCP element, no other above-the-fold image. This is the load-bearing fix: it moves the image's fetch to document-parse time alongside the CSS and JS bundle, cutting the 200–600ms discovery gap.

   ```tsx
   <Image src="/hero.png" alt="Acme dashboard preview" width={1280} height={720} preload />
   ```

2. **Regression prevention.** Add the `@next/next/no-img-element` ESLint rule at `error` (it lives in `eslint-config-next/core-web-vitals`, not Biome — naming it here is the documented reach, not a wiring change to this target's `verify`). A raw `<img>` ships without lazy-loading defaults, without responsive `srcset`, and — the part that bites LCP/CLS — without forced `width`/`height`, so the rule keeps the team on `next/image`, where the eager-load and dimension discipline is enforceable.

3. **The CLS protection layer.** Keep `width`/`height` (already present) so the box is reserved before the bytes arrive; `preload` alone speeds the fetch but unsized media still shifts layout on load. The two are orthogonal — `preload` is the LCP reach, `width`/`height` is the CLS reach — and the LCP element needs both.

Half-credit names only `preload` (or only `priority`, the deprecated alias) and stops; full credit names the renamed prop, the `no-img-element` lint as the regression guard, and `width`/`height` as the separate CLS layer.
