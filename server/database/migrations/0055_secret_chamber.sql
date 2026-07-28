ALTER TYPE "public"."question_type" ADD VALUE 'rating';--> statement-breakpoint
ALTER TABLE "job_question" ADD COLUMN "config" jsonb;