ALTER TABLE "app_users" ADD COLUMN "row_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "manager_employee_id" uuid;--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_manager_employee_id_employees_id_fk" FOREIGN KEY ("manager_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_users_issuer_employee_idx" ON "app_users" USING btree ("issuer","employee_id");