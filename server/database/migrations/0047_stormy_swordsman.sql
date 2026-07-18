CREATE TYPE "public"."application_step_status" AS ENUM('pending', 'submitted', 'verified');--> statement-breakpoint
CREATE TYPE "public"."email_template_type" AS ENUM('interview_invitation', 'application_accepted', 'application_rejected', 'fee_verified', 'documents_verified');--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "fee_status" "application_step_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "fee_verified_by_id" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "fee_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "documents_status" "application_step_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "documents_verified_by_id" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "documents_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "email_template" ADD COLUMN "template_type" "email_template_type" DEFAULT 'interview_invitation' NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "application_fee_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "application_fee_url" text;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "application_fee_amount" integer;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "application_fee_currency" text;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "require_signed_documents" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "signing_url" text;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_fee_verified_by_id_user_id_fk" FOREIGN KEY ("fee_verified_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_documents_verified_by_id_user_id_fk" FOREIGN KEY ("documents_verified_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_template_org_type_idx" ON "email_template" USING btree ("organization_id","template_type");