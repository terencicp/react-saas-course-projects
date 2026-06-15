# Finding 004 — No Content-Security-Policy header: the XSS backstop is absent

**Category:** Security headers (security baseline).
**Severity:** high — the one header that turns an XSS sink from a full compromise into a blocked attack is missing site-wide, and finding 2 is a live stored-XSS sink that this header would have neutered; it is high rather than critical because it is a missing defense-in-depth layer, not the sink itself (finding 2 owns the critical), but with both gone the page has no second line.

## Rule

The header baseline ships a Content-Security-Policy, and the only CSP that holds up is a per-request nonce plus `'strict-dynamic'` — a nonce so the browser runs only the scripts the server vouched for this request, and `'strict-dynamic'` so scripts those trust load without re-listing every host (chapter 081, lesson 1 — the six security headers, where CSP is the one that blocks live attacks rather than hardening posture, and the nonce-plus-`'strict-dynamic'` shape is the only one that survives a real app's script graph; an allow-list of hosts without a nonce is the anti-pattern that lesson names).

## Location

A "missing-piece" finding — the CSP belongs in two files and is in neither:

- `next.config.ts` (repo root), `staticSecurityHeaders` (lines 14–26) and the `headers()` function (lines 33–38): ships five static headers — `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` — and **no** `Content-Security-Policy`. The static base of a CSP would live here.
- `src/proxy.ts` (the whole file, lines 6–26): does a cookie-presence redirect and returns `NextResponse.next()` with no header mutation; it generates **no** per-request nonce and sets **no** CSP. The per-request half of the policy belongs here.

How it surfaced — the header audit is a `curl -I` against the running app, then a grep to confirm where the piece should be and is not:

```
# 1. The running-app fingerprint: what headers does the app actually return?
curl -sI http://localhost:3000/ | grep -i 'security\|content-security\|frame\|referrer'
# 2. Confirm the absence in source, in both files where a CSP could live.
rg -ni 'content-security-policy|nonce|strict-dynamic' next.config.ts src/proxy.ts
```

`curl -I` returns `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and `Permissions-Policy` — and **no** `Content-Security-Policy` line at all (`securityheaders.com` would dock the grade for the same gap). The presence of the other five is what makes this "CSP absent," not "no headers" — someone configured the baseline and stopped one header short. Grep 2 returns nothing, confirming the policy lives in no file: `next.config.ts` has no CSP key in `staticSecurityHeaders`, and `proxy.ts` mints no nonce. The headers the target *does* ship are recorded as legitimate (HSTS, the framing and sniffing guards, the referrer and permissions controls all hold); the single missing one is the finding.

## Consequence

The application has no second line of defense against script injection. CSP is the layer that, even when an XSS sink slips through, stops the injected `<script>` from running because the browser refuses any script the server did not vouch for. With no CSP, a payload that reaches the page executes with the full authority of the user's authenticated session — and finding 2 is exactly such a payload already in the database, a stored note whose body renders as live HTML. A user opening that invoice has the attacker's script run as them: it reads their session, exfiltrates the invoice data they can see, fires authenticated mutations on their behalf, or rewrites the page to phish their password, and nothing on the page or in the browser stops it. This is not a hypothetical future sink — it is the missing backstop behind a live one, so the two findings compound: the sink lets the script in, the absent CSP lets it run.

## Fix

Ship a CSP in two halves — a static base in `next.config.ts` and a per-request nonce in `proxy.ts` — wired with `'strict-dynamic'`. The nonce is the load-bearing part: generate one per request and let the browser trust only scripts carrying it.

```ts
// proxy.ts — mint a nonce per request, set the policy header, thread it to RSCs.
const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
  `style-src 'self' 'unsafe-inline'`,
  `object-src 'none'`,
  `base-uri 'self'`,
].join('; ');
const requestHeaders = new Headers(request.headers);
requestHeaders.set('x-nonce', nonce); // Server Components read this and stamp it on their <script> tags.
const response = NextResponse.next({ request: { headers: requestHeaders } });
response.headers.set('Content-Security-Policy', csp);
```

The mechanics: a fresh `nonce` per request (`Buffer.from(crypto.randomUUID()).toString('base64')`), threaded to Server Components through the `x-nonce` request header so each `<script>` they render carries `nonce={...}`, and `'strict-dynamic'` so a nonce-trusted script can load its own dependencies without the policy enumerating every CDN host — the only shape that survives Next.js's own chunk graph. The host-allow-list parts (`default-src`, `object-src 'none'`, `base-uri 'self'`) form the static base; the script policy is request-time because the nonce is. The trade-off to acknowledge: a marketing site that injects third-party scripts (analytics, chat widgets) cannot use a strict nonce policy without nonce-ing or hashing each one, so the strict policy is for the authenticated app surface and a looser, documented policy covers any third-party-heavy public page — that is a deliberate per-surface decision, not a reason to ship no CSP.

This is the defense-in-depth backstop for **finding 2** (the unsanitized `dangerouslySetInnerHTML` XSS sink on invoice notes): a strict nonce CSP would refuse the injected `<script>` even if the sanitizer were missing. It is the complement, **not** the substitute — the two are one threat model split into the sink and its missing backstop, and a launch needs both. Sanitizing the sink (finding 2) is the gate; the CSP here is the wall behind it. Neither retires the other; each is scored on its own.
