-- Custom SQL migration file, put your code below! --

-- The audit_logs policies are authored `TO authenticated`. That role is provided
-- by Neon/Supabase but absent on a vanilla Docker Postgres (only `postgres`
-- exists), so CREATE POLICY ... TO authenticated would fail to apply. drizzle-kit
-- never creates it, so this --custom migration does — idempotently — and must run
-- BEFORE the audit-policy migration. The role is unprivileged and unused at
-- runtime in local dev (the app connects as the superuser postgres, which has
-- BYPASSRLS); it exists so the policy DDL applies and a `SET ROLE authenticated`
-- psql session can demonstrate the deny behavior.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;
