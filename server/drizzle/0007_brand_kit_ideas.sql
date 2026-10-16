CREATE TABLE "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"url" text,
	"media_asset_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN "font_family" text;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN "signature" text;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN "default_hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ideas_org_idx" ON "ideas" USING btree ("organization_id","status","created_at");