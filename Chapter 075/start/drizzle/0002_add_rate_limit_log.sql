CREATE TYPE "public"."rate_limit_event" AS ENUM('rate_limit_rejected', 'rate_limit_unavailable');--> statement-breakpoint
CREATE TABLE "rate_limit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event" "rate_limit_event" NOT NULL,
	"limiter" text NOT NULL,
	"key" text NOT NULL,
	"remaining" integer NOT NULL,
	"reset" bigint NOT NULL,
	"fired_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
