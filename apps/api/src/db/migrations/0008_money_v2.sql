CREATE TYPE "public"."reconciliation_status" AS ENUM('ok', 'issues', 'failed');--> statement-breakpoint
CREATE TABLE "creator_fund_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"views" integer NOT NULL,
	"amount_cents" bigint NOT NULL,
	"release_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_fund_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"pool_cents" bigint NOT NULL,
	"allocated_cents" bigint NOT NULL,
	"qualified_views" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_fund_runs_period" CHECK ("creator_fund_runs"."period_end" >= "creator_fund_runs"."period_start"),
	CONSTRAINT "creator_fund_runs_pool" CHECK ("creator_fund_runs"."pool_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "fee_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" text DEFAULT 'KE' NOT NULL,
	"creator_id" uuid,
	"bps" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_policies_bps_range" CHECK ("fee_policies"."bps" between 0 and 5000)
);
--> statement-breakpoint
CREATE TABLE "reconciliation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "reconciliation_status" NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"triggered_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "fund_allocation_id" uuid;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "provider" text DEFAULT 'mpesa_daraja' NOT NULL;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN "provider" text DEFAULT 'mpesa_daraja' NOT NULL;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN "fee_policy_id" uuid;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN "fee_bps" integer;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN "fee_cents" bigint;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN "writer_cents" bigint;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN "release_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN "anonymous" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN "note_hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN "note_hidden_by" uuid;--> statement-breakpoint
ALTER TABLE "creator_fund_allocations" ADD CONSTRAINT "creator_fund_allocations_run_id_creator_fund_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."creator_fund_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_fund_allocations" ADD CONSTRAINT "creator_fund_allocations_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_fund_runs" ADD CONSTRAINT "creator_fund_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_policies" ADD CONSTRAINT "fee_policies_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_policies" ADD CONSTRAINT "fee_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creator_fund_allocations_key" ON "creator_fund_allocations" USING btree ("run_id","creator_id");--> statement-breakpoint
CREATE INDEX "creator_fund_allocations_release_idx" ON "creator_fund_allocations" USING btree ("release_at") WHERE "creator_fund_allocations"."released_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "creator_fund_runs_period_key" ON "creator_fund_runs" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "fee_policies_scope_idx" ON "fee_policies" USING btree ("country","creator_id","effective_from");--> statement-breakpoint
CREATE INDEX "reconciliation_runs_started_idx" ON "reconciliation_runs" USING btree ("started_at");--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_fund_allocation_id_creator_fund_allocations_id_fk" FOREIGN KEY ("fund_allocation_id") REFERENCES "public"."creator_fund_allocations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_fee_policy_id_fee_policies_id_fk" FOREIGN KEY ("fee_policy_id") REFERENCES "public"."fee_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_note_hidden_by_users_id_fk" FOREIGN KEY ("note_hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tips_joke_paid_idx" ON "tips" USING btree ("joke_id","paid_at") WHERE "tips"."status" = 'paid';--> statement-breakpoint
CREATE INDEX "tips_release_idx" ON "tips" USING btree ("release_at") WHERE "tips"."status" = 'paid' and "tips"."released_at" is null;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_note_length" CHECK ("tips"."note" is null or char_length("tips"."note") <= 140);--> statement-breakpoint
-- Tips paid before fee policies and holds: record the split they were charged
-- (from the ledger) and treat them as released, since their money already sits
-- in the writer's available balance.
UPDATE "tips" t SET
	"fee_cents" = coalesce((SELECT -sum(l."amount_cents") FROM "ledger_entries" l WHERE l."tip_id" = t."id" AND l."account" = 'platform:fees'), 0),
	"writer_cents" = coalesce((SELECT -sum(l."amount_cents") FROM "ledger_entries" l WHERE l."tip_id" = t."id" AND l."account" = 'creator:' || t."creator_id"::text), 0),
	"release_at" = t."paid_at",
	"released_at" = t."paid_at"
WHERE t."status" = 'paid' AND t."writer_cents" IS NULL;--> statement-breakpoint
UPDATE "tips" SET "fee_bps" = round("fee_cents" * 10000.0 / ("amount_kes" * 100))::int
WHERE "status" = 'paid' AND "fee_bps" IS NULL AND "fee_cents" IS NOT NULL;
