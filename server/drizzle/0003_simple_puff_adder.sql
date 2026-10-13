ALTER TABLE "creatives" ADD COLUMN "short_description" text;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;