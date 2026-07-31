ALTER TYPE "public"."application_step_status" ADD VALUE 'waived';--> statement-breakpoint
ALTER TYPE "public"."email_template_type" ADD VALUE 'fee_waived' BEFORE 'documents_verified';