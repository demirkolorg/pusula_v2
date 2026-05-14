ALTER TYPE "public"."activity_event_type" ADD VALUE 'board.background_changed';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'board.background_cleared';--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "background" text;