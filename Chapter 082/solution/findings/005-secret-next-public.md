# Finding 005 — Resend secret shipped to the browser via NEXT_PUBLIC_RESEND_API_KEY

**Category:** Secrets management + env validation (security baseline).
**Severity:** critical — the live Resend API key is in every visitor's JavaScript bundle and a Client Component already sends it out of the browser on click, so any user (or anyone reading the bundle) can mail from the verified domain; the key must be treated as compromised the moment this shipped.

## Rule

Secrets never reach the client bundle, and the `NEXT_PUBLIC_*` prefix is the only path to the browser — so a secret is never named `NEXT_PUBLIC_*` (chapter 081, lesson 6, Rule 2 — secrets never reach the client bundle; the watch-out names `NEXT_PUBLIC_STRIPE_SECRET_KEY` as the canonical name-contradiction bug). The structural defense behind that rule is the `@t3-oss/env-nextjs` server/client split: server-only secrets live in the `server` partition where importing them from a Client Component is a build-time error, and only genuinely public values go in `client` behind `NEXT_PUBLIC_` (chapter 081, lesson 7, invariant 2 — server-only vars in `server`, client-shipped in `client`). Declaring the key in `client` is exactly the move that disarms the split.

## Location

`src/env.ts` (the env boundary, imported as `@/env`) and the Client Component call site:

- `src/env.ts`, the `client` partition (lines 42–51): `NEXT_PUBLIC_RESEND_API_KEY: z.string().min(1)` at line 50 — a secret declared client-side, alongside the genuinely-public `NEXT_PUBLIC_APP_*` and `NEXT_PUBLIC_POSTHOG_*` values. The healthy copy is already right above it in the `server` block: `RESEND_API_KEY: z.string().min(1)` at line 24, read only by `src/lib/email.ts` behind `import 'server-only'`. So the secret exists twice — once correctly server-side, once leaked client-side.
- `src/app/(protected)/settings/resend-test.tsx`, lines 1–62: a `'use client'` component (`ResendClientTest`) that reads `env.NEXT_PUBLIC_RESEND_API_KEY` and `fetch`es `https://api.resend.com/emails` directly from the browser with `Authorization: \`Bearer ${env.NEXT_PUBLIC_RESEND_API_KEY}\`` (lines 23–36). Mounted by `src/app/(protected)/settings/page.tsx` (line 20), so it renders on `/settings`.

How it surfaced — the secret audit's three canonical leak greps, then a running-app confirmation:

```
# 1. Every NEXT_PUBLIC_* the schema declares — which ones are secret-shaped?
rg -n 'NEXT_PUBLIC_' src/env.ts
# 2. Env access that bypasses the typed boundary (the L7 invariant-1 grep).
rg -n 'process\.env\.' --glob '!src/env.ts' src
# 3. Where is the leaked var actually read?
rg -Rn 'NEXT_PUBLIC_RESEND_API_KEY' src/app
```

Grep 1 returns five `NEXT_PUBLIC_*` keys; four are verified public-safe and recorded as legitimate, not findings — `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_POSTHOG_KEY` (a PostHog *project* key is public by design), `NEXT_PUBLIC_POSTHOG_HOST`. The fifth, `NEXT_PUBLIC_RESEND_API_KEY`, fails the "verified public-safe" test on its name alone: a Resend API key authorizes sending mail. Grep 2 returns only legitimate framework exceptions — `process.env.NODE_ENV` in `src/lib/auth.ts`, `process.env.LOG_LEVEL` in `src/lib/logger.ts`, and a comment in `src/emails/components/email-layout.tsx` — none a secret bypass, all recorded as non-findings (the schema boundary is otherwise intact, and there is no `SKIP_ENV_VALIDATION` escape hatch left open, so the L7 build-time check still fires). Grep 3 lands the call site: the Client Component reads the key and ships it.

Running-app confirmation: open `/settings`, open DevTools' Network tab, click "Send test email." A `POST https://api.resend.com/emails` leaves the browser carrying `Authorization: Bearer <the key>` in plaintext — the key is observable in the request headers, and a `view-source`/bundle search for the key string finds it inlined in the client JavaScript. The response status is irrelevant (a fake key returns 401); the fingerprint is the key in the bundle and the request leaving the browser, not whether the mail sent.

## Consequence

The Resend API key is published. Anyone who opens the app reads it straight out of the client JavaScript — no exploit required, the bundle is served to every visitor — and the key authorizes sending email from the organization's verified sending domain. An attacker mails phishing and spam *as* the company: messages that pass SPF/DKIM/DMARC because they come from the real verified domain, land in customers' inboxes looking authentic, and harvest credentials or push fraudulent invoices. The domain's sending reputation collapses under the abuse volume, so the legitimate transactional mail the product depends on — password resets, invitations, receipts — starts going to spam or bouncing for every real customer. This is live now: the key is in production, in the bundle, with a Client Component already wired to fire it from the browser, and the only thing between an attacker and the domain is that they have not looked at the bundle yet.

## Fix

The fix is structural, not a rename of the variable in place. The key belongs server-side and the send belongs behind a Server Action that holds it there:

1. **Delete `NEXT_PUBLIC_RESEND_API_KEY` from the `client` partition** of `src/env.ts` (and from `runtimeEnv`). The legitimate `RESEND_API_KEY` already lives in the `server` block — there is exactly one place the key should be, and it is already there.
2. **Move the send to a Server Action.** Replace the browser `fetch` in `resend-test.tsx` with a call to a `'use server'` action that runs `sendEmail(...)` from `src/lib/email.ts` (the existing `server-only` boundary that constructs `new Resend(env.RESEND_API_KEY)` and returns a `Result`). The client component keeps its button and status text and calls the action; the key never crosses to the browser, and the `@t3-oss/env-nextjs` split now *enforces* that — importing the `server`-partition key from the client file becomes a build-time error.

```ts
// settings/actions.ts — the key stays on the server.
'use server';
export const sendResendTest = async (): Promise<Result<{ id: string }>> =>
  sendEmail({ to: 'test@example.com', subject: 'test', react: <TestEmail />, idempotencyKey: 'resend-test' });
```

3. **Rotate the leaked key — this is mandatory, not optional.** The key has already shipped to production in the client bundle, so renaming it without rotation leaves the published secret live. Run the chapter 081, lesson 6 rotation runbook in **Vercel-before-provider** order: create a fresh Resend key, set the new value in Vercel's env (with the "sensitive" flag) and redeploy *first*, then revoke the old key in the Resend dashboard — so there is no window where deployments break on a dead credential. Treat this as an event-driven rotation (suspected leak), not a calendar one.

A repo lint rule that rejects any `NEXT_PUBLIC_*` whose name matches `SECRET|TOKEN|KEY` (without a `PUBLISHABLE`-style qualifier) is worth adding so this cannot recur — but it is a **follow-up belt**, not the fix. The fix is the server-partition move plus the rotation; the lint rule only stops the next person from re-introducing it.
