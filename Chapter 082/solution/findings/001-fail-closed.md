# Finding 001 — Fail-closed bypass on the ownership-transfer role check

**Category:** Fail-closed checks (error discipline).
**Severity:** critical — an owner-only mutation runs when the gate cannot prove the actor is an owner, and it is reachable from a real admin Server Action, so an unauthorized ownership transfer is one thrown role check away.

## Rule

Any check that gates access fails closed: a thrown access check is a refusal, never a pass, and the action body never runs when the check threw (chapter 080, lesson 1 — Refuse by default; the canonical fail-open anti-pattern named there is `try { await requireRole(...) } catch { /* log and continue */ }`).

## Location

`src/lib/admin/transfer-ownership.ts`:

- `transferOwnershipAction` — the `try { await requireRole('owner') } catch (error) { console.warn(...) }` at lines 29–35, then the membership update at lines 37–51.
- `transferOwnership` (the direct, non-action variant the admin console calls server-side) — the same swallowing `try/catch` at lines 64–68, then the update at lines 70–73.

How it surfaced — the audit method this finding sets for every later one: open the running admin surface, open the source, and let a command name the suspect. Two greps land it.

```
# 1. Server Actions that do not route through the canonical wrapper.
rg -l "'use server'" --glob '*.ts' src | xargs rg --files-without-match 'authedAction'
# 2. The fail-open shape itself — a role check inside a try/catch.
rg -n "requireRole\('owner'\)" src --glob '*.ts'
```

Grep 1 returns four files, and all four are legitimate non-findings — recorded as such, not scored: `src/app/(auth)/sign-up/actions.ts` (the public account-creation path — gated by Better Auth's own `signUpEmail`, not by a role, by design), `src/app/(auth)/sign-in/actions.ts` (same — the pre-auth sign-in path), `src/app/(protected)/sign-out-action.ts` (sign-out needs only a session, no role gate), and `src/lib/billing/require-plan.ts` — a false positive: it matches only because a comment line contains the literal text `'use server'` (`import 'server-only'` — NOT 'use server'). It is not a Server Action at all; it is a `server-only` plan gate that throws a `BillingError`, fail-closed by design. The defect file is *not* among grep 1's hits, because `transfer-ownership.ts` correctly imports and routes through `authedAction` — a wrapper-bypass grep alone misses it. Naming the hits a command returns that are *not* findings is half the discipline — a finding is a defect named against a rule, never "this file looked unusual."

Grep 2 is what lands `transfer-ownership.ts` directly, because the defect lives *inside* a properly wrapped action. Reading both call sites confirms the `requireRole('owner')` throw is caught and discarded, and control falls through to the `organization.ownerId` update.

## Consequence

The ownership transfer goes through when the role check cannot prove the actor is an owner. A below-owner member who reaches the admin action, or any caller during a Postgres blip while the membership row is read, has their thrown refusal swallowed by the `catch`, and the next line reassigns the organization's owner. In user-visible terms: an account that should never have been allowed to transfer ownership transfers it, and the legitimate owner can be locked out of their own organization. The secondary, operator read is worse for being plausible — the code looks careful (it `console.warn`s the failure before continuing), so this reads as discipline when it is fail-open dressed up: logging a refusal and then proceeding is not logging, it is allowing.

## Fix

Remove the `try/catch` around `requireRole('owner')` at both call sites and let the throw propagate. `requireRole` is declared to throw on a below-owner actor and on its own internal failure (it reads the membership row and compares the role); the caller's job is to run it for its throw, not to interpret it. With the catch gone, the throw reaches the `authedAction` boundary that wraps `transferOwnershipAction`, which converts it to the refusal branch of the carried-in `Result` — mapped to the `unauthorized` code from the seven-code set — so the user gets a 403-shaped outcome and the action body never runs (chapter 080, lesson 1, the structural-shape section: the check throws on its own failure, the wrapper catches in one place and converts to a refusal).

```ts
// The whole gate. No try, no catch, no fall-through.
await requireRole('owner');
await withTenant(ctx.orgId, async (tx) => { /* update + logAudit */ });
```

The direct `transferOwnership` variant has no `authedAction` boundary; the senior reach is to delete its duplicated logic and route the admin console through the wrapped action so the one fail-closed seam is the only path, rather than leaving a second copy to drift. Either way the rule holds: when `requireRole` throws, nothing downstream runs. Do not re-introduce a re-throw inside a catch — the point is that the call site holds no error-handling machinery at all; the wrapper owns it.
