CREATE TABLE "hashtag_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "timezone" text DEFAULT 'Asia/Kolkata' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "posting_slots" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "post_targets" ADD COLUMN "first_comment_id" text;--> statement-breakpoint
ALTER TABLE "post_targets" ADD COLUMN "first_comment_error" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "first_comment" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "repeat_every_days" integer;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "repeat_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "parent_post_id" uuid;--> statement-breakpoint
ALTER TABLE "hashtag_groups" ADD CONSTRAINT "hashtag_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hashtag_groups_org_name_idx" ON "hashtag_groups" USING btree ("organization_id","name");