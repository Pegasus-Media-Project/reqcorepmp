ALTER TABLE "application" ADD COLUMN "confirmation_code" text;--> statement-breakpoint
CREATE UNIQUE INDEX "application_confirmation_code_idx" ON "application" USING btree ("confirmation_code");