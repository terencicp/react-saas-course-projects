# Rollback runbook

How to roll back a bad production deploy — and the one caveat that makes a schema
migration different from a code deploy.

<!-- TODO(L6) — fill the four-step alias-re-point gesture, the `git revert` follow-up,
     re-enabling auto-assignment, and expand the forward-only-migration caveat below
     against the live Vercel/Neon accounts. -->

## The caveat

**An alias re-point does NOT undo a forward-only migration.** Pointing the
production alias back at the previous deployment reverts the *code*, but the
database schema has already moved forward — the dropped column is gone. Rolling
back code without a compatible schema is its own outage.

## The four-step alias re-point

## The `git revert` follow-up

## Re-enabling auto-assignment
