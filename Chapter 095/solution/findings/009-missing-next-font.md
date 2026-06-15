# Finding 009 — Marketing page loads its font via a raw `<link>` instead of `next/font`

**Category:** LCP / Core Web Vitals (chapter 094, lessons 1–2). Bonus finding — the senior reach above the 8/8 floor, on the same LCP path as finding 007.
**Severity:** medium — a render-blocking third-party font on the unauthenticated first-impression route delays LCP and risks a font-swap reflow, but the page renders correct content and the swap is a layout shift, not lost data. Above low because it sits on the same highest-traffic, search-scored marketing surface as finding 007 and compounds that finding's LCP regression.

## Rule

Web fonts are loaded through `next/font` so the font is self-hosted (no render-blocking third-party request on the LCP path) and ships with fallback metrics that match the swap-in face's dimensions, so the swap does not reflow text (chapter 094, lessons 1–2 — LCP path discipline + CLS). A raw `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` violates both halves: it is a render-blocking request to a third-party origin discovered during document parse, and the swap from the fallback to the web font has no metric matching, so the text reflows when the font lands.

## Location

`src/app/(marketing)/layout.tsx`, lines 14–18: the layout renders a raw

```
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" />
```

instead of importing the font through `next/font/google`.

How it surfaced — the same audit method as finding 007: open the running app beside the source. Load `/` with the Chrome DevTools Network panel filtered to the `fonts.googleapis.com` / `fonts.gstatic.com` origins: the stylesheet request is render-blocking (it sits on the critical request chain ahead of first paint), it opens a new connection to a third-party origin (DNS + TLS on the LCP path), and the woff2 it pulls arrives after first paint, so the headline first paints in the fallback face and reflows when Inter swaps in. Confirm in source with a grep:

```
rg -n "fonts.googleapis.com|<link" "src/app/(marketing)/layout.tsx"
```

The match is the raw `<link>` in the marketing layout — the file where the `next/font` import should live.

## Consequence

User-visible on the marketing route's first paint. The render-blocking third-party stylesheet adds a DNS lookup plus a TLS handshake to a new origin before the font CSS is even parsed, late-discovering the woff2 on the LCP path and pushing the largest text block's final paint later — compounding finding 007's hero-image LCP regression on the same route. When the web font finally swaps in over the unmatched system fallback, the headline and body reflow (different glyph widths and line-box height), which registers as a Cumulative Layout Shift the moment a visitor's eye is already on the page. Both effects hit the 75th-percentile mobile-on-slow-network traffic that dominates Core Web Vitals field data and Google Search ranking.

## Fix

Documented, not patched — the marketing layout keeps the defect so the surface stays readable for the lesson. The senior reach:

1. **Self-host through `next/font`.** Import the face via `next/font/google` (or `next/font/local`) and apply its generated class on the layout's root, removing the raw `<link>` entirely. This eliminates the third-party render-blocking request — the font ships from the app's own origin, no extra DNS/TLS on the LCP path.

   ```tsx
   import { Inter } from 'next/font/google';

   const inter = Inter({ subsets: ['latin'], display: 'swap' });

   const MarketingLayout = ({ children }: { children: ReactNode }) => (
     <div className={inter.className}>{children}</div>
   );
   ```

2. **Fallback metrics for CLS.** `next/font` automatically computes a size-adjusted fallback (`size-adjust`, `ascent-override`, `descent-override`) that matches the web font's metrics, so the pre-swap fallback occupies the same box and the swap-in does not reflow — the CLS protection the raw `<link>` lacks.

Same LCP-path discipline as finding 007: the LCP element and everything on its critical request chain (the hero image *and* the font that paints the largest text) get first-class loading treatment. Half-credit names only the render-blocking request and stops; full credit names `next/font` for self-hosting *and* the fallback-metrics layer that prevents the swap reflow.
