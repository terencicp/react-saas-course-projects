# Finding 004 — PostHog captures before consent; the analytics SDK fires on first load

**Category:** Consent-gated analytics — nothing non-essential fires pre-consent (chapter 093, lesson 3; chapter 081, lesson 5).
**Severity:** high — behavioral data leaves the browser before the user opts in, which is a GDPR/ePrivacy violation with regulatory and reputational exposure. High, not critical: it leaks the visitor's own behavior to a single processor, not third-party PII or a secret, and it is fixed by wiring, not a breach response.

## Rule

No non-essential tracker may fire before the user has explicitly consented — the consent must come *before* the processing, not after (chapter 081, lesson 5 — `Consent gate`). For PostHog that means the load-bearing pair from chapter 093, lesson 3 (`Wiring PostHog through the consent gate`): init with `opt_out_capturing_by_default: true` (belt one) **and** call `posthog.opt_in_capturing()` only on the consented branch — plus belt two, a consent-gated dynamic `import('posthog-js')` so the SDK never enters the page until `analytics` is true. Analytics helps the business, never the user's requested service, so it is never essential.

## Location

- `src/app/_components/providers.tsx` — initializes PostHog **unconditionally** in a `useEffect` with `opt_out_capturing_by_default: false`, with no `ConsentProvider` above it and no `useConsent()` read. The SDK is imported at module top (`import posthog from 'posthog-js'`), so the chunk ships on first paint regardless of consent.
- `src/lib/analytics/consent.ts` — **does not exist**. There is no single seam for grant/revoke, so any accept/reject would write the cookie inline and call `opt_in_capturing()` directly from the banner.
- The consent banner / `useConsent()` hook — **absent**: nothing reads or records the choice, so there is no boundary between "page loaded" and "analytics fired."

How it surfaced — read the running app first. Open `/` in an incognito window with DevTools → Network filtered to `posthog`/`ingest`, before touching any banner:

```
# Network panel filter: ingest
```

A `posthog-js` chunk loads and an init/`/ingest` request fires on first paint, before any choice. That pre-consent request in the waterfall is the fingerprint — the breach is visible without reading a line of source.

## Consequence

A visitor who has not consented — or who would reject — has their behavior captured the instant the page paints: the SDK loads, opens a connection, and the first event leaves the browser before the banner is even rendered. That is processing without prior consent, the exact GDPR/ePrivacy failure the consent gate exists to prevent, and it is user-visible in the Network panel of any privacy-conscious visitor who looks. `opt_out_capturing_by_default: false` is the literal switch that makes it happen; the missing import gate is what lets the SDK reach the page at all.

## Fix

The installed seam — slice S4. Two belts plus one seam for grant/revoke.

1. **Belt one + belt two in the provider.** `ConsentProvider` (`src/app/_components/consent-provider.tsx`) is the single source of truth for the `analytics` flag, read by `useConsent()`. The `PostHogGate` in `src/app/_components/providers.tsx` reads that flag and only on the consented branch runs a dynamic `import('posthog-js')` (belt two — the SDK is absent until `analytics` is true), then inits with the canonical shape (`api_host: '/ingest'`, `ui_host: 'https://eu.posthog.com'`, `defaults: '2026-01-30'`, `capture_pageview: false`) and **`opt_out_capturing_by_default: true`** (belt one). `ConsentProvider` must sit above `PostHogGate` or `useConsent()` throws.

2. **One seam for grant/revoke** — `src/lib/analytics/consent.ts`. `grantAnalyticsConsent()` calls `posthog.opt_in_capturing()`, writes the `consent_analytics` cookie, and captures a one-off `analytics_consent_granted` event; `revokeAnalyticsConsent()` calls `opt_out_capturing()` + `reset()` and clears the cookie. The banner's Accept/Reject route through these — never an inline cookie write — so a feature engineer never reaches for `opt_in_capturing()` directly.

   The pair is load-bearing: default-out alone never captures even after consent, and a banner that acts only on "Accept" leaves "Reject" in the default state. Both buttons go through the one seam, equal-weight.

   ```tsx
   const accept = async () => {
     await grantAnalyticsConsent(); // opt_in_capturing() + cookie + event
     setAnalytics(true);
   };
   ```

3. **Session continuity.** Init runs with capture off after a reload, so on mount — if the `consent_analytics` cookie is already present — the gate re-calls `opt_in_capturing()`. Without it, a returning visitor who already consented stops being captured silently after every reload.
