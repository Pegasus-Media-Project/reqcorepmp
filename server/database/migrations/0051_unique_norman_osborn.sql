CREATE TABLE "job_interview_availability" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"title" text DEFAULT 'Interview' NOT NULL,
	"type" "interview_type" DEFAULT 'video' NOT NULL,
	"duration" integer DEFAULT 60 NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"location" text,
	"capacity" integer DEFAULT 1 NOT NULL,
	"date_from" text NOT NULL,
	"date_to" text NOT NULL,
	"days_of_week" jsonb NOT NULL,
	"window_start" text NOT NULL,
	"window_end" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_slot" ADD COLUMN "generated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job_interview_availability" ADD CONSTRAINT "job_interview_availability_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_interview_availability" ADD CONSTRAINT "job_interview_availability_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_interview_availability_job_id_idx" ON "job_interview_availability" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_interview_availability_organization_id_idx" ON "job_interview_availability" USING btree ("organization_id");