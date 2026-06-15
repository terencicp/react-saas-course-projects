# Finding 003 — Silent ownership transfer: the billing-side mutation writes no audit row

**Category:** Audit-log gaps (security baseline).
**Severity:** high — a security-relevant, tenancy-changing mutation lands with no audit row, so the single most consequential event a tenant can experience leaves no trace; it is high rather than critical because the transfer itself is correct (access is not bypassed here — finding 1 owns that), the loss is the record, not the gate.

## Rule

Every security-relevant mutation co-transacts an audit-log write: the canonical six-category event set (auth, membership, billing, data-export, deletion, **ownership/tenancy**) each mandates a row, and the write rides the same transaction as the mutation so a committed change can never exist without its audit record (chapter 081, lesson 3 — the audit-log canonical event set + transaction discipline; the `entity.verb-pasttense` single-dot naming convention).

## Location

`src/lib/billing/transfer-ownership.ts`:

- `transferBillingOwnership` — the `db.transaction` at lines 27–45 re-points `organization.ownerId` (lines 28–31) and rewrites both membership owner rows (lines 33–42), then closes the transaction at line 44–45 with no `logAudit(tx, …)` call.

How it surfaced — two greps cross-walked against the canonical event set, the audit method this category reuses: find every transactional mutation, then check each against the categories that mandate a row.

```
# 1. Every db.transaction in the lib — the mutations that must each carry an audit write.
rg -n "db.transaction" src/lib --glob '*.ts'
# 2. The mutating verbs inside them — does an UPDATE to a tenancy column ride an audit row?
rg -n "\.update\(" src/lib/billing/transfer-ownership.ts
```

Grep 1 returns two transactional sites: `src/lib/webhooks/stripe.ts` (legitimate, not a finding — it co-transacts `billing.subscription.*` audit rows on every branch) and `src/lib/billing/transfer-ownership.ts`. Grep 2 lands three `.update(` calls — `organization.ownerId` and the two `member.role` rewrites — all inside the transaction. Reading the transaction body confirms the absence: `rg "logAudit" src/lib/billing/transfer-ownership.ts` returns nothing, while `src/lib/invitations/manage.ts` co-transacts `member.role-changed` on the *lesser* mutation of demoting a non-owner. The category cross-walk is what scores this: changing the org's owner belongs to the ownership/tenancy category, which mandates a row; the mutation belongs to that category and writes none, so it is a finding, not a "looked unusual" note.

## Consequence

The most security-relevant event a tenant can experience — control of billing and tenancy moving from one account to another — happens and leaves no record. For an auditor reconstructing who held ownership when (a SOC 2 access-review, a breach forensic timeline, a customer dispute over who authorized a billing change), the ownership-transfer history is unrecoverable: the `audit_logs` table, which is the system of record for exactly this, has a hole where the row should be. The customer-facing surface lies by omission too — the Activity page driven by `recentAuditLogs` shows invitations sent, roles changed, and subscriptions activated, but is silent on the one change that handed someone else control of the organization, so a legitimate owner who lost their org sees nothing in their own activity feed to explain it.

## Fix

Add the in-transaction audit write to the `db.transaction` block in `transferBillingOwnership`, modeled on the `member.role-changed` write already shipping in `src/lib/invitations/manage.ts`. The slug is `org.ownership-transferred` — single-dot `entity.verb-pasttense`, the canonical form, and the exact slug the admin-side `src/lib/admin/transfer-ownership.ts` already uses, so the two transfer paths land one event name in the log rather than two drifting ones. The write rides `tx` (never the global `db`), so it commits or rolls back atomically with the ownership change — the `logAudit` signature takes the transaction as its first argument precisely to make an off-transaction write fail to typecheck. The payload is redacted to the two ids the event is about; no emails, no roles, no PII in the row.

```ts
await db.transaction(async (tx) => {
  await tx.update(organization).set({ ownerId: nextOwnerId }).where(eq(organization.id, orgId));
  // …the two member.role rewrites…
  await logAudit(tx, {
    action: 'org.ownership-transferred',
    subjectType: 'organization',
    subjectId: orgId,
    payload: { previousOwnerId, nextOwnerId },
  });
});
```

Add `org.ownership-transferred` to the canonical event set's documented catalog so the category is explicit, not implied. The write is documented once, here — it is an audit-log gap, not a message-split or fail-closed concern (those are findings 1 and the redactor; the ownership record is written in exactly one place).
