ALTER TYPE "public"."activity_event_type" ADD VALUE 'list.icon_changed';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'list.icon_cleared';--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "icon_color" text;