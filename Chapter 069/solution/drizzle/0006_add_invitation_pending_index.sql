-- Custom SQL migration file, put your code below! --

-- One pending invite per address per org, case-insensitively. The lower(email)
-- expression + the partial WHERE status = 'pending' predicate are written as literal
-- SQL: a re-invite once the prior invite is accepted/canceled is allowed, but a second
-- pending invite to the same address raises SQLSTATE 23505, which isUniqueViolation
-- maps to a conflict. This lives in a --custom migration, NOT a src/db/schema/auth.ts
-- table-callback edit: any later `pnpm auth:generate` run rewrites auth.ts wholesale
-- and silently drops a hand-added index, so the generated file is not a safe home for
-- an application-only index.
CREATE UNIQUE INDEX "invitation_org_email_pending_unique" ON "invitation" (organization_id, lower(email)) WHERE status = 'pending';