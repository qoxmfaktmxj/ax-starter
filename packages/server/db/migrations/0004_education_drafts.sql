CREATE TABLE "education_courses" (
	"id" varchar(20) PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(120) NOT NULL,
	CONSTRAINT "education_courses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "education_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"course_id" varchar(20),
	"reason" text NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "education_drafts" ADD CONSTRAINT "education_drafts_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "education_drafts" ADD CONSTRAINT "education_drafts_course_id_education_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."education_courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "education_drafts_owner_updated_idx" ON "education_drafts" USING btree ("owner_id","updated_at","id");