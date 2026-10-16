-- Image jokes store a storage key; the API builds the public URL from it (MEDIA_BASE_URL).
ALTER TABLE "jokes" DROP CONSTRAINT "jokes_content";--> statement-breakpoint
ALTER TABLE "jokes" RENAME COLUMN "image_url" TO "image_key";--> statement-breakpoint
ALTER TABLE "jokes" ADD CONSTRAINT "jokes_content" CHECK (("jokes"."kind" = 'text' and "jokes"."setup" is not null and "jokes"."punchline" is not null)
        or ("jokes"."kind" = 'image' and "jokes"."image_key" is not null and "jokes"."image_alt" is not null));
