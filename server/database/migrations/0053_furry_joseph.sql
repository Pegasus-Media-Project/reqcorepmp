ALTER TYPE "public"."email_template_type" ADD VALUE 'self_schedule_invitation';--> statement-breakpoint
ALTER TABLE "interview" ADD COLUMN "ics_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job_interview_availability" ADD COLUMN "invitation_template_id" text;