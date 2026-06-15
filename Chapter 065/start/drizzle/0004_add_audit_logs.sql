CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_user_id" text,
	"actor_ip" text,
	"actor_user_agent" text,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_logs_org_created" ON "audit_logs" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_audit_logs_org_actor_created" ON "audit_logs" USING btree ("organization_id","actor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "audit_logs_org_isolation" ON "audit_logs" AS PERMISSIVE FOR ALL TO "authenticated" USING ("audit_logs"."organization_id" = current_setting('app.org_id', true)) WITH CHECK ("audit_logs"."organization_id" = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "audit_logs_no_update" ON "audit_logs" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING (false);--> statement-breakpoint
CREATE POLICY "audit_logs_no_delete" ON "audit_logs" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (false);