ALTER TYPE "public"."question_type" ADD VALUE 'info';--> statement-breakpoint
ALTER TABLE "job_question" ADD COLUMN "content" text;