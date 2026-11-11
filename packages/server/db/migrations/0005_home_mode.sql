CREATE TYPE "public"."home_mode" AS ENUM('portal', 'work');--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "home_mode" "home_mode" DEFAULT 'work' NOT NULL;