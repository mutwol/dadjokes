CREATE TABLE "deliveries" (
	"user_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"joke_id" uuid NOT NULL,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"opened_at" timestamp with time zone,
	CONSTRAINT "deliveries_user_id_local_date_pk" PRIMARY KEY("user_id","local_date"),
	CONSTRAINT "deliveries_expiry_after_delivery" CHECK ("deliveries"."expires_at" > "deliveries"."delivered_at")
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_joke_id_jokes_id_fk" FOREIGN KEY ("joke_id") REFERENCES "public"."jokes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliveries_joke_idx" ON "deliveries" USING btree ("joke_id");