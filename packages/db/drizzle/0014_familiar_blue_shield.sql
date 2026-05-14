ALTER TYPE "public"."activity_event_type" ADD VALUE IF NOT EXISTS 'board.background_changed';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE IF NOT EXISTS 'board.background_cleared';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE IF NOT EXISTS 'comment.mentioned';--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN IF NOT EXISTS "background" text;
