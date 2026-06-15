ALTER TABLE "plan_entitlements" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_entitlements" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_entitlements" ADD COLUMN "subscription_id" text;--> statement-breakpoint
ALTER TABLE "plan_entitlements" ADD COLUMN "current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plan_entitlements" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_entitlements" ADD COLUMN "seats" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_entitlements" ADD COLUMN "last_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plan_entitlements" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;