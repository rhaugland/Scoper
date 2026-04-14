ALTER TYPE "public"."project_status" ADD VALUE 'delivered';--> statement-breakpoint
CREATE TABLE "actuals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_item_id" uuid NOT NULL,
	"actual_hours" integer NOT NULL,
	"notes" text,
	"logged_at" timestamp DEFAULT now() NOT NULL,
	"logged_by" uuid NOT NULL,
	CONSTRAINT "actuals_scope_item_id_unique" UNIQUE("scope_item_id")
);
--> statement-breakpoint
ALTER TABLE "actuals" ADD CONSTRAINT "actuals_scope_item_id_scope_items_id_fk" FOREIGN KEY ("scope_item_id") REFERENCES "public"."scope_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actuals" ADD CONSTRAINT "actuals_logged_by_users_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;