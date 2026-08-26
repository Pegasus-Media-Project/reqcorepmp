ALTER TABLE "application" ADD COLUMN "accepted_email_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "rejected_email_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "accepted_template_id" text;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "rejected_template_id" text;