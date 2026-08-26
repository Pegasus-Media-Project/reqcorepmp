CREATE TYPE "public"."slot_signup_source" AS ENUM('manual', 'availability');--> statement-breakpoint
CREATE TABLE "interview_slot_signup" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"slot_id" text NOT NULL,
	"user_id" text NOT NULL,
	"source" "slot_signup_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviewer_slot_availability" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"user_id" text NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_slot_signup" ADD CONSTRAINT "interview_slot_signup_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_slot_signup" ADD CONSTRAINT "interview_slot_signup_slot_id_interview_slot_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."interview_slot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_slot_signup" ADD CONSTRAINT "interview_slot_signup_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_slot_availability" ADD CONSTRAINT "reviewer_slot_availability_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_slot_availability" ADD CONSTRAINT "reviewer_slot_availability_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_slot_availability" ADD CONSTRAINT "reviewer_slot_availability_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "slot_signup_slot_user_idx" ON "interview_slot_signup" USING btree ("slot_id","user_id");--> statement-breakpoint
CREATE INDEX "slot_signup_organization_id_idx" ON "interview_slot_signup" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "slot_signup_slot_id_idx" ON "interview_slot_signup" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "slot_signup_user_id_idx" ON "interview_slot_signup" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reviewer_slot_availability_job_user_idx" ON "reviewer_slot_availability" USING btree ("job_id","user_id");--> statement-breakpoint
CREATE INDEX "reviewer_slot_availability_organization_id_idx" ON "reviewer_slot_availability" USING btree ("organization_id");