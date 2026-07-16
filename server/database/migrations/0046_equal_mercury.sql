CREATE TYPE "public"."review_stage" AS ENUM('screening', 'interview');--> statement-breakpoint
CREATE TYPE "public"."reviewer_invite_status" AS ENUM('pending', 'accepted', 'revoked');--> statement-breakpoint
CREATE TABLE "interview_reviewer" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"interview_id" text NOT NULL,
	"user_id" text NOT NULL,
	"invited_at" timestamp,
	"calendar_synced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"application_id" text NOT NULL,
	"job_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"stage" "review_stage" NOT NULL,
	"rating" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviewer_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"invitation_id" text NOT NULL,
	"job_id" text NOT NULL,
	"invited_by_id" text NOT NULL,
	"status" "reviewer_invite_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_reviewer" ADD CONSTRAINT "interview_reviewer_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_reviewer" ADD CONSTRAINT "interview_reviewer_interview_id_interview_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interview"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_reviewer" ADD CONSTRAINT "interview_reviewer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_invite" ADD CONSTRAINT "reviewer_invite_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_invite" ADD CONSTRAINT "reviewer_invite_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_invite" ADD CONSTRAINT "reviewer_invite_invited_by_id_user_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interview_reviewer_interview_user_idx" ON "interview_reviewer" USING btree ("interview_id","user_id");--> statement-breakpoint
CREATE INDEX "interview_reviewer_organization_id_idx" ON "interview_reviewer" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "interview_reviewer_interview_id_idx" ON "interview_reviewer" USING btree ("interview_id");--> statement-breakpoint
CREATE INDEX "review_organization_id_idx" ON "review" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "review_application_id_idx" ON "review" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "review_job_id_idx" ON "review" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_org_application_reviewer_stage_idx" ON "review" USING btree ("organization_id","application_id","reviewer_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "reviewer_invite_invitation_job_idx" ON "reviewer_invite" USING btree ("invitation_id","job_id");--> statement-breakpoint
CREATE INDEX "reviewer_invite_organization_id_idx" ON "reviewer_invite" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reviewer_invite_email_idx" ON "reviewer_invite" USING btree ("email");--> statement-breakpoint
CREATE INDEX "reviewer_invite_job_id_idx" ON "reviewer_invite" USING btree ("job_id");