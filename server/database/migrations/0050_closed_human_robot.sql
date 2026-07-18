CREATE TYPE "public"."interview_slot_status" AS ENUM('open', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."slot_booking_status" AS ENUM('confirmed', 'cancelled');--> statement-breakpoint
CREATE TABLE "interview_slot" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"created_by_id" text NOT NULL,
	"title" text NOT NULL,
	"type" "interview_type" DEFAULT 'video' NOT NULL,
	"starts_at" timestamp NOT NULL,
	"duration" integer DEFAULT 60 NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"location" text,
	"interviewers" jsonb,
	"notes" text,
	"capacity" integer DEFAULT 1 NOT NULL,
	"booked_count" integer DEFAULT 0 NOT NULL,
	"status" "interview_slot_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "interview_slot_capacity_check" CHECK ("interview_slot"."booked_count" <= "interview_slot"."capacity")
);
--> statement-breakpoint
CREATE TABLE "interview_slot_booking" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"slot_id" text NOT NULL,
	"application_id" text NOT NULL,
	"interview_id" text,
	"status" "slot_booking_status" DEFAULT 'confirmed' NOT NULL,
	"booked_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview" ADD COLUMN "slot_id" text;--> statement-breakpoint
ALTER TABLE "interview_slot" ADD CONSTRAINT "interview_slot_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_slot" ADD CONSTRAINT "interview_slot_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_slot" ADD CONSTRAINT "interview_slot_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_slot_booking" ADD CONSTRAINT "interview_slot_booking_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_slot_booking" ADD CONSTRAINT "interview_slot_booking_slot_id_interview_slot_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."interview_slot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_slot_booking" ADD CONSTRAINT "interview_slot_booking_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_slot_booking" ADD CONSTRAINT "interview_slot_booking_interview_id_interview_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interview"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interview_slot_organization_id_idx" ON "interview_slot" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "interview_slot_job_id_idx" ON "interview_slot" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "interview_slot_starts_at_idx" ON "interview_slot" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "interview_slot_status_idx" ON "interview_slot" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "slot_booking_app_active_idx" ON "interview_slot_booking" USING btree ("application_id") WHERE status = 'confirmed';--> statement-breakpoint
CREATE UNIQUE INDEX "slot_booking_slot_app_idx" ON "interview_slot_booking" USING btree ("slot_id","application_id");--> statement-breakpoint
CREATE INDEX "slot_booking_organization_id_idx" ON "interview_slot_booking" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "slot_booking_slot_id_idx" ON "interview_slot_booking" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "slot_booking_application_id_idx" ON "interview_slot_booking" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "interview_slot_id_idx" ON "interview" USING btree ("slot_id");--> statement-breakpoint
-- Hand-written: interview.slot_id FK. NOT declared in the Drizzle schema on
-- purpose (declaring it collapses Nuxt's Serialize<> route-type inference for
-- /api/applications/:id). Drizzle's snapshot doesn't track this, so it won't be
-- dropped by future `db:generate` runs.
ALTER TABLE "interview" ADD CONSTRAINT "interview_slot_id_interview_slot_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."interview_slot"("id") ON DELETE set null ON UPDATE no action;
