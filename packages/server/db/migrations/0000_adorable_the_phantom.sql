CREATE TABLE "app_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"employee_id" uuid,
	"org_id" uuid,
	"active" integer DEFAULT 1 NOT NULL,
	"role_code" varchar(30) NOT NULL,
	"data_scope" varchar(20) NOT NULL,
	"authz_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"correlation_id" uuid NOT NULL,
	"action" varchar(50) NOT NULL,
	"outcome" varchar(20) NOT NULL,
	"subject_ids" jsonb,
	"source" varchar(30) NOT NULL,
	"client" text,
	"changed_fields" jsonb
);
--> statement-breakpoint
CREATE TABLE "command_results" (
	"actor_id" uuid NOT NULL,
	"operation" varchar(40) NOT NULL,
	"idempotency_key" varchar(120) NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"authz_version" integer NOT NULL,
	"http_status" integer NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "command_results_actor_id_operation_idempotency_key_pk" PRIMARY KEY("actor_id","operation","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_no" varchar(20) NOT NULL,
	"name" varchar(80) NOT NULL,
	"org_id" uuid NOT NULL,
	"position" varchar(50) DEFAULT '' NOT NULL,
	"hire_date" date NOT NULL,
	"status" varchar(10) DEFAULT 'ACTIVE' NOT NULL,
	"email" varchar(254) DEFAULT '' NOT NULL,
	"monthly_salary" numeric(18, 2),
	"row_version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_employee_no_unique" UNIQUE("employee_no")
);
--> statement-breakpoint
CREATE TABLE "export_job_items" (
	"job_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"employee_id" uuid NOT NULL,
	"projected_json" jsonb NOT NULL,
	CONSTRAINT "export_job_items_job_id_ordinal_pk" PRIMARY KEY("job_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"idempotency_key" varchar(120) NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"format" varchar(10) NOT NULL,
	"request" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"dispatched_at" timestamp with time zone,
	"artifact_id" uuid,
	"snapshot_at" timestamp with time zone,
	"authz_version" integer NOT NULL,
	"subject_ids" jsonb,
	"projection_version" integer,
	"error_code" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_kind" varchar(20) NOT NULL,
	"owner_id" uuid NOT NULL,
	"original_name" text NOT NULL,
	"size" bigint NOT NULL,
	"content_type" varchar(80) NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"backend_id" varchar(20) NOT NULL,
	"object_key" varchar(100) NOT NULL,
	"state" varchar(20) NOT NULL,
	"scan_status" varchar(20) NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"waiver_by" text,
	"waiver_reason" text,
	"waiver_expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_objects_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(120) NOT NULL,
	"parent_id" uuid,
	"row_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "organizations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_results" ADD CONSTRAINT "command_results_actor_id_app_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_job_items" ADD CONSTRAINT "export_job_items_job_id_export_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."export_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_actor_id_app_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_artifact_id_file_objects_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."file_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_identity_key" ON "app_users" USING btree ("issuer","subject");--> statement-breakpoint
CREATE INDEX "audit_events_time_idx" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "employees_org_status_id_idx" ON "employees" USING btree ("org_id","status","id");--> statement-breakpoint
CREATE UNIQUE INDEX "export_jobs_actor_key" ON "export_jobs" USING btree ("actor_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "file_objects_owner_idx" ON "file_objects" USING btree ("owner_kind","owner_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");