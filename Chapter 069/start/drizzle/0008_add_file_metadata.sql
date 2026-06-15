CREATE TABLE "file_metadata" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"uploaded_by" text,
	"object_key" text NOT NULL,
	"original_file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"soft_deleted_at" timestamp with time zone,
	CONSTRAINT "file_metadata_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "file_metadata_byte_size_nonneg" CHECK ("file_metadata"."byte_size" >= 0)
);
--> statement-breakpoint
ALTER TABLE "file_metadata" ADD CONSTRAINT "file_metadata_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_metadata" ADD CONSTRAINT "file_metadata_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_file_metadata_org_active" ON "file_metadata" USING btree ("organization_id","soft_deleted_at","uploaded_at" DESC NULLS LAST,"id" DESC NULLS LAST);