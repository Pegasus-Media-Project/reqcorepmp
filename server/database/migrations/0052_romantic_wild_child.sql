ALTER TABLE "job_interview_availability" ADD COLUMN "break_start" text;--> statement-breakpoint
ALTER TABLE "job_interview_availability" ADD COLUMN "break_end" text;--> statement-breakpoint
ALTER TABLE "job_interview_availability" ADD COLUMN "buffer" integer DEFAULT 0 NOT NULL;