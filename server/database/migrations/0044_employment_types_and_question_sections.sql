CREATE TABLE "employment_type" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"label" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_question_section" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "job" ALTER COLUMN "type" SET DEFAULT 'Full-time';--> statement-breakpoint
UPDATE "job" SET "type" = CASE "type"
	WHEN 'full_time' THEN 'Full-time'
	WHEN 'part_time' THEN 'Part-time'
	WHEN 'contract' THEN 'Contract'
	WHEN 'internship' THEN 'Internship'
	ELSE "type" END;--> statement-breakpoint
ALTER TABLE "job_question" ADD COLUMN "section_id" text;--> statement-breakpoint
ALTER TABLE "employment_type" ADD CONSTRAINT "employment_type_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_question_section" ADD CONSTRAINT "job_question_section_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_question_section" ADD CONSTRAINT "job_question_section_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employment_type_organization_id_idx" ON "employment_type" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employment_type_org_label_idx" ON "employment_type" USING btree ("organization_id","label");--> statement-breakpoint
CREATE INDEX "job_question_section_organization_id_idx" ON "job_question_section" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "job_question_section_job_id_idx" ON "job_question_section" USING btree ("job_id");--> statement-breakpoint
ALTER TABLE "job_question" ADD CONSTRAINT "job_question_section_id_job_question_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."job_question_section"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_question_section_id_idx" ON "job_question" USING btree ("section_id");--> statement-breakpoint
INSERT INTO "employment_type" ("id", "organization_id", "label", "display_order")
SELECT gen_random_uuid(), o."id", v.label, v.ord
FROM "organization" o
CROSS JOIN (VALUES ('Full-time', 0), ('Part-time', 1), ('Contract', 2), ('Internship', 3)) AS v(label, ord)
ON CONFLICT ("organization_id", "label") DO NOTHING;