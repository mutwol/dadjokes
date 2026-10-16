-- Trigram matching for possible-copy detection. pg_trgm is a trusted extension, so the database owner can create it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."decline_reason" AS ENUM('possible_copy', 'not_a_dad_joke', 'offensive', 'unclear', 'other');--> statement-breakpoint
ALTER TABLE "jokes" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "jokes" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jokes" ADD COLUMN "decline_reason" "decline_reason";--> statement-breakpoint
ALTER TABLE "jokes" ADD COLUMN "decline_note" text;--> statement-breakpoint
ALTER TABLE "jokes" ADD CONSTRAINT "jokes_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jokes_text_trgm_idx" ON "jokes" USING gin ((lower(coalesce("setup", '') || ' ' || coalesce("punchline", ''))) gin_trgm_ops);--> statement-breakpoint
UPDATE "jokes" SET "decline_reason" = 'other' WHERE "status" = 'declined' AND "decline_reason" IS NULL;--> statement-breakpoint
ALTER TABLE "jokes" ADD CONSTRAINT "jokes_declined_has_reason" CHECK (("jokes"."status" = 'declined') = ("jokes"."decline_reason" is not null));