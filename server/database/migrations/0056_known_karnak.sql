CREATE TABLE "job_preview_link" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"created_by_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_preview_link_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "job_preview_link" ADD CONSTRAINT "job_preview_link_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_preview_link" ADD CONSTRAINT "job_preview_link_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_preview_link" ADD CONSTRAINT "job_preview_link_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_preview_link_organization_id_idx" ON "job_preview_link" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "job_preview_link_job_id_idx" ON "job_preview_link" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_preview_link_token_idx" ON "job_preview_link" USING btree ("token");