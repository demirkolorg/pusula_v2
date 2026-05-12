ALTER TYPE "public"."activity_event_type" ADD VALUE 'card.completed';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'card.uncompleted';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'card.cover_changed';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'card.cover_cleared';--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "completed_by" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "cover_color" text;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;