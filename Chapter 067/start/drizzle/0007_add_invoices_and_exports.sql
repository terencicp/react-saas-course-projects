CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"run_id" text,
	"row_count" integer,
	"idempotency_key" text,
	"day_bucket" text NOT NULL,
	"pages_done" integer,
	"pages_total" integer,
	"download_url" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"number" text NOT NULL,
	"customer_name" text NOT NULL,
	"status" text NOT NULL,
	"total" numeric NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exports_org_requester_day_unique" ON "exports" USING btree ("organization_id","requested_by","day_bucket");--> statement-breakpoint
CREATE INDEX "idx_invoices_org_created" ON "invoices" USING btree ("organization_id","created_at" DESC NULLS LAST);