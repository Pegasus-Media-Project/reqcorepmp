ALTER TABLE "job" ADD COLUMN "hide_application_questions" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "application_questions_pdf_url" text;