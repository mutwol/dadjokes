CREATE TYPE "public"."joke_kind" AS ENUM('text', 'image');--> statement-breakpoint
CREATE TYPE "public"."joke_status" AS ENUM('in_review', 'scheduled', 'delivered', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TABLE "joke_topics" (
	"joke_id" uuid NOT NULL,
	"topic_slug" text NOT NULL,
	CONSTRAINT "joke_topics_joke_id_topic_slug_pk" PRIMARY KEY("joke_id","topic_slug")
);
--> statement-breakpoint
CREATE TABLE "jokes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"kind" "joke_kind" DEFAULT 'text' NOT NULL,
	"setup" text,
	"punchline" text,
	"image_url" text,
	"image_alt" text,
	"caption" text,
	"background" "tone" DEFAULT 'red' NOT NULL,
	"region" text,
	"status" "joke_status" DEFAULT 'in_review' NOT NULL,
	"deliver_on" date,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jokes_content" CHECK (("jokes"."kind" = 'text' and "jokes"."setup" is not null and "jokes"."punchline" is not null)
        or ("jokes"."kind" = 'image' and "jokes"."image_url" is not null and "jokes"."image_alt" is not null)),
	CONSTRAINT "jokes_scheduled_has_day" CHECK (("jokes"."deliver_on" is not null) = ("jokes"."status" in ('scheduled', 'delivered')))
);
--> statement-breakpoint
ALTER TABLE "joke_topics" ADD CONSTRAINT "joke_topics_joke_id_jokes_id_fk" FOREIGN KEY ("joke_id") REFERENCES "public"."jokes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joke_topics" ADD CONSTRAINT "joke_topics_topic_slug_topics_slug_fk" FOREIGN KEY ("topic_slug") REFERENCES "public"."topics"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jokes" ADD CONSTRAINT "jokes_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "joke_topics_topic_idx" ON "joke_topics" USING btree ("topic_slug");--> statement-breakpoint
CREATE INDEX "jokes_creator_idx" ON "jokes" USING btree ("creator_id","submitted_at");--> statement-breakpoint
CREATE INDEX "jokes_review_queue_idx" ON "jokes" USING btree ("submitted_at") WHERE "jokes"."status" = 'in_review';--> statement-breakpoint
CREATE UNIQUE INDEX "jokes_one_per_day_key" ON "jokes" USING btree ("deliver_on",coalesce("region", '')) WHERE "jokes"."deliver_on" is not null;