ALTER TYPE "public"."activity_event_type" ADD VALUE IF NOT EXISTS 'card.cover_image_changed';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE IF NOT EXISTS 'card.cover_image_cleared';--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "cover_image_attachment_id" text;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cards_cover_image_attachment_id_attachments_id_fk'
  ) THEN
    ALTER TABLE "cards" ADD CONSTRAINT "cards_cover_image_attachment_id_attachments_id_fk" FOREIGN KEY ("cover_image_attachment_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
