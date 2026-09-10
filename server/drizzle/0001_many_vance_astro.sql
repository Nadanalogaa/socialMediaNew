CREATE TABLE "data_deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"confirmation_code" text NOT NULL,
	"provider" text DEFAULT 'meta' NOT NULL,
	"external_user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"connections_deleted" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "data_deletion_confirmation_idx" ON "data_deletion_requests" USING btree ("confirmation_code");--> statement-breakpoint
CREATE INDEX "data_deletion_external_user_idx" ON "data_deletion_requests" USING btree ("external_user_id");