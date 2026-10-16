CREATE TABLE "billing_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"razorpay_order_id" text NOT NULL,
	"razorpay_payment_id" text,
	"plan_code" text NOT NULL,
	"interval" text NOT NULL,
	"amount_in_paise" integer NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"created_by" uuid,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_source" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_platform_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_orders_razorpay_idx" ON "billing_orders" USING btree ("razorpay_order_id");--> statement-breakpoint
CREATE INDEX "billing_orders_org_idx" ON "billing_orders" USING btree ("organization_id","created_at");--> statement-breakpoint
UPDATE "users" SET "is_platform_admin" = true WHERE "email" = 'cloud@nadanaloga.com';--> statement-breakpoint
UPDATE "organizations" SET "plan_code" = 'agency' WHERE "plan_code" = 'scale';--> statement-breakpoint
UPDATE "organizations" SET "plan_source" = 'manual' WHERE "plan_code" <> 'free';
