CREATE TABLE "job_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"program_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "program_id" text;--> statement-breakpoint
ALTER TABLE "job_assignment" ADD CONSTRAINT "job_assignment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignment" ADD CONSTRAINT "job_assignment_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignment" ADD CONSTRAINT "job_assignment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program" ADD CONSTRAINT "program_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_assignment" ADD CONSTRAINT "program_assignment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_assignment" ADD CONSTRAINT "program_assignment_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_assignment" ADD CONSTRAINT "program_assignment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_assignment_user_job_idx" ON "job_assignment" USING btree ("user_id","job_id");--> statement-breakpoint
CREATE INDEX "job_assignment_organization_id_idx" ON "job_assignment" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "job_assignment_job_id_idx" ON "job_assignment" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "program_organization_id_idx" ON "program" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_assignment_user_program_idx" ON "program_assignment" USING btree ("user_id","program_id");--> statement-breakpoint
CREATE INDEX "program_assignment_organization_id_idx" ON "program_assignment" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "program_assignment_program_id_idx" ON "program_assignment" USING btree ("program_id");--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_program_id_idx" ON "job" USING btree ("program_id");