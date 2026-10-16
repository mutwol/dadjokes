CREATE TYPE "public"."joke_event_type" AS ENUM('replay', 'share');--> statement-breakpoint
CREATE TYPE "public"."reaction_kind" AS ENUM('laugh', 'groan', 'facepalm', 'drum');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('copied', 'offensive', 'spam', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_resolution" AS ENUM('dismissed', 'removed');--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"joke_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "comments_body_length" CHECK (char_length("comments"."body") between 1 and 280)
);
--> statement-breakpoint
CREATE TABLE "joke_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"joke_id" uuid NOT NULL,
	"user_id" uuid,
	"type" "joke_event_type" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "joke_stats_daily" (
	"joke_id" uuid NOT NULL,
	"day" date NOT NULL,
	"opens" integer DEFAULT 0 NOT NULL,
	"replays" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"reactions" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "joke_stats_daily_joke_id_day_pk" PRIMARY KEY("joke_id","day")
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"user_id" uuid NOT NULL,
	"joke_id" uuid NOT NULL,
	"kind" "reaction_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_user_id_joke_id_pk" PRIMARY KEY("user_id","joke_id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"joke_id" uuid,
	"comment_id" uuid,
	"reason" "report_reason" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution" "report_resolution",
	CONSTRAINT "reports_one_target" CHECK (("reports"."joke_id" is null) <> ("reports"."comment_id" is null))
);
--> statement-breakpoint
ALTER TABLE "jokes" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jokes" ADD COLUMN "removed_by" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_joke_id_jokes_id_fk" FOREIGN KEY ("joke_id") REFERENCES "public"."jokes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joke_events" ADD CONSTRAINT "joke_events_joke_id_jokes_id_fk" FOREIGN KEY ("joke_id") REFERENCES "public"."jokes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joke_events" ADD CONSTRAINT "joke_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joke_stats_daily" ADD CONSTRAINT "joke_stats_daily_joke_id_jokes_id_fk" FOREIGN KEY ("joke_id") REFERENCES "public"."jokes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_joke_id_jokes_id_fk" FOREIGN KEY ("joke_id") REFERENCES "public"."jokes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_joke_id_jokes_id_fk" FOREIGN KEY ("joke_id") REFERENCES "public"."jokes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_joke_idx" ON "comments" USING btree ("joke_id","created_at");--> statement-breakpoint
CREATE INDEX "joke_events_joke_idx" ON "joke_events" USING btree ("joke_id","occurred_at");--> statement-breakpoint
CREATE INDEX "reactions_joke_idx" ON "reactions" USING btree ("joke_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_joke_once_key" ON "reports" USING btree ("reporter_id","joke_id") WHERE "reports"."joke_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_comment_once_key" ON "reports" USING btree ("reporter_id","comment_id") WHERE "reports"."comment_id" is not null;--> statement-breakpoint
CREATE INDEX "reports_open_idx" ON "reports" USING btree ("created_at") WHERE "reports"."resolved_at" is null;--> statement-breakpoint
ALTER TABLE "jokes" ADD CONSTRAINT "jokes_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;