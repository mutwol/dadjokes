CREATE TYPE "public"."joke_origin" AS ENUM('everywhere', 'local');--> statement-breakpoint
CREATE TYPE "public"."payout_method" AS ENUM('mpesa');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('reader', 'writer', 'curator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."tone" AS ENUM('red', 'navy', 'yellow', 'green', 'denim');--> statement-breakpoint
CREATE TABLE "email_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_methods" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"method" "payout_method" NOT NULL,
	"phone" text NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"secret_hash" text NOT NULL,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"subscriber_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_subscriber_id_creator_id_pk" PRIMARY KEY("subscriber_id","creator_id"),
	CONSTRAINT "subscriptions_not_self" CHECK ("subscriptions"."subscriber_id" <> "subscriptions"."creator_id")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"slug" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"delivery_hour" smallint DEFAULT 8 NOT NULL,
	"joke_origin" "joke_origin" DEFAULT 'everywhere' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_hour_range" CHECK ("user_preferences"."delivery_hour" between 0 and 23)
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "user_topics" (
	"user_id" uuid NOT NULL,
	"topic_slug" text NOT NULL,
	CONSTRAINT "user_topics_user_id_topic_slug_pk" PRIMARY KEY("user_id","topic_slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"handle" text,
	"country" text,
	"bio" text DEFAULT '' NOT NULL,
	"tone" "tone" DEFAULT 'denim' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_handle_format" CHECK ("users"."handle" ~ '^[a-z0-9_]{3,20}$')
);
--> statement-breakpoint
ALTER TABLE "payout_methods" ADD CONSTRAINT "payout_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_subscriber_id_users_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_topics" ADD CONSTRAINT "user_topics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_topics" ADD CONSTRAINT "user_topics_topic_slug_topics_slug_fk" FOREIGN KEY ("topic_slug") REFERENCES "public"."topics"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_codes_email_created_idx" ON "email_codes" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_creator_idx" ON "subscriptions" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_key" ON "users" USING btree ("handle");