-- Custom SQL migration file, put your code below! --

-- drizzle-kit emits ENABLE ROW LEVEL SECURITY (0004) but never FORCE. Without
-- FORCE, the table owner — the role migrations run as, which also owns the table —
-- bypasses every policy, so the deny-UPDATE/DELETE and org-isolation rules would
-- not bind a SET ROLE authenticated session that is also the owner. FORCE makes the
-- policies apply to the owner too, so the append-only guarantee holds.
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- On Neon/Supabase the authenticated role arrives pre-granted schema USAGE + table
-- privileges; on vanilla Docker it has neither (Postgres 15+ no longer grants the
-- public schema to non-owners), so a SET ROLE authenticated session hits a
-- grant-level "permission denied" before any policy is consulted — the policies
-- could never be demonstrated. Granting USAGE on the schema + CRUD on the table
-- lets the org-isolation / deny-UPDATE / deny-DELETE policies (not a missing grant)
-- decide the outcome.
GRANT USAGE ON SCHEMA "public" TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "audit_logs" TO authenticated;
