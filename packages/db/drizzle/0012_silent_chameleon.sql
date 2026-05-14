ALTER TYPE "public"."activity_event_type" ADD VALUE 'list.color_changed';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'list.color_cleared';--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "color" text;