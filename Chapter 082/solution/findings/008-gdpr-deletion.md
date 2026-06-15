# Finding 008 — Account deletion leaves the user's PII behind

**Category:** GDPR deletion (security baseline).
**Severity:** critical — a successful "delete my account" request leaves personal data live across half the schema and every external service, and the only proof it ran was a one-row `DELETE`. PII persisting past a granted erasure request is a direct Article 17 breach, and the user was told it was done.

## Rule

A GDPR erasure request runs as an async deletion job that walks the full retention catalog: every table holding the subject's PII or references is cleared, every external service the PII reached is told to delete it, and the audit trail is *anonymized — not hard-deleted* so the immutable record survives without naming the person (chapter 081, lesson 4 — Account deletion and the retention catalog; the three deletion shapes are hard-delete the row, anonymize the row, and cascade-delete the children, and "anonymize don't delete" is the rule for the append-only audit log specifically).

## Location

`src/lib/account/delete-account.ts`:

- `deleteAccount(userId)` — lines 21–25. The whole body is one statement: `await db.delete(users).where(eq(users.id, userId))`. There is no transaction, no graph walk, no external call, no anonymization, and no route through the async deletion job.

How it surfaced — read the deletion handler against the retention catalog, then grep for every table and service that holds this user's data and confirm the handler touches none of them.

```
# 1. The deletion entry point and what it actually deletes.
rg -n "delete\(" src/lib/account/delete-account.ts
# 2. The retention catalog — every table that references user.id.
rg -n "references\(\(\) => user(s)?\.id" src/db/schema.ts src/db/schema/auth.ts src/db/audit.ts
# 3. The healthy shape that already exists, for the fix to name.
rg -n "schemaTask|delete-user" trigger/delete-user.ts
```

Grep 2 names the data graph the handler skips. The subject's `user.id` is referenced by:

- `member` (org membership rows — cascade on `user.id`, but the deletion is *not* the same as a foreign-key cascade because the user row is the only thing being deleted here, and the order/anonymization still has to be deliberate),
- `invitation` (`inviterId` — invitations this user sent),
- `invoice_notes` (`authorId` — free-text the user typed, real PII),
- `exports` (`requestedBy` — export-run history tied to the user),
- `session` / `account` (Better Auth credential + session rows, cascade on `user.id`),
- `audit_logs` (`actorUserId` — the append-only trail; this is the one row set that must be *kept and anonymized*, never deleted).

External services the same PII reached, none of which a `DELETE users` touches: Stripe (the org's Customer), Resend (the contact / suppression entry), PostHog (the person profile), and R2 (the user's stored objects). The discipline here is to name every place the data could have leaked to, not only the obvious tables — the externals are where an auditor finds the gap a SQL-only deletion misses.

The healthy reference already ships in the repo at `trigger/delete-user.ts` (the `deleteUser` `schemaTask`, id `'delete-user'`): it walks `invitation`, `invoiceNotes`, `exports`, `member`, anonymizes `audit_logs`, names the four external deletes, then removes the `users` row last, all inside one `db.transaction`. The seeded handler does not import or enqueue it.

## Consequence

A user clicks "delete my account", the request returns success, and the app deletes exactly one row. Their invoice notes, the invitations they sent, their export history, and their session and credential rows stay live, and their actor id stays stamped on every audit-log row they ever generated. Their Stripe Customer, Resend contact, PostHog profile, and R2 objects are never told anything. In legal terms this is a failure to honour an Article 17 erasure request: personal data persists after the controller confirmed it was erased, which is the breach itself, not a risk of one. The confirmation the user received — "your account and data have been deleted" — is false, and that false confirmation is its own exposure, because it removes the user's chance to escalate while their data is still everywhere.

## Fix

Route the request through the async deletion job, not an inline `DELETE`. The `deleteAccount` handler's job is to mark the account `deletion_in_progress` (so sign-in is blocked for an account mid-deletion and the user can't re-authenticate against a half-deleted graph) and enqueue the `deleteUser` Trigger.dev `schemaTask` already present at `trigger/delete-user.ts`; the job owns the actual erasure. Inside one `db.transaction`, the job walks the retention catalog — delete `invitation`, `invoice_notes`, `exports`, `member`, and the Better-Auth `session` / `account` rows — and **anonymizes** the `audit_logs` rows rather than deleting them: the append-only trail must survive for compliance, so the row stays and only the actor is scrubbed. The deletion/audit-trail tension resolves exactly here — anonymization is how both the right-to-erasure and the immutable audit record hold at once.

```ts
// inside the deleteUser job's db.transaction, the audit-trail anonymize step:
await tx
  .update(auditLogs)
  .set({ actorUserId: null, actorIp: null, actorUserAgent: null })
  .where(eq(auditLogs.actorUserId, userId));
```

After the in-database graph, the job fires the external deletes it cannot do in SQL — Stripe Customer, Resend contact/suppression, PostHog person, R2 objects — then removes the `users` row last so a partial failure leaves a recoverable, still-anonymizing state rather than orphaned children. It closes by writing `account.deletion-completed` through `logAudit` as an `ExplicitAuditEvent` with `actorUserId: null` (the job has no session, so the actor is the system, not the deleted user). The fix is structural — the async job, the catalog walk, and the anonymize step — never a wider `DELETE`.
