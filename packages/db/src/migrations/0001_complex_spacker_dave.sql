ALTER TABLE "projects" ADD COLUMN "blended_rate" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "margin_percent" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "weekly_capacity" integer DEFAULT 30;