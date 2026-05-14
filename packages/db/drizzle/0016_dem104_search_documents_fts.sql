ALTER TYPE "public"."search_entity_type" ADD VALUE 'list' AFTER 'board';--> statement-breakpoint
ALTER TABLE "search_documents" ADD COLUMN "card_id" text;--> statement-breakpoint
ALTER TABLE "search_documents" ADD COLUMN "search_vector" tsvector DEFAULT ''::tsvector NOT NULL;--> statement-breakpoint
ALTER TABLE "search_documents" ALTER COLUMN "body" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "search_documents" ALTER COLUMN "body" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "search_documents" ALTER COLUMN "labels" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "search_documents" ALTER COLUMN "labels" TYPE text[] USING CASE WHEN "labels" IS NULL OR "labels" = '' THEN ARRAY[]::text[] ELSE string_to_array("labels", ' ') END;--> statement-breakpoint
ALTER TABLE "search_documents" ALTER COLUMN "labels" SET DEFAULT ARRAY[]::text[];--> statement-breakpoint
ALTER TABLE "search_documents" ALTER COLUMN "labels" SET NOT NULL;--> statement-breakpoint
UPDATE "search_documents"
SET "search_vector" =
  setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('simple', array_to_string(coalesce("labels", ARRAY[]::text[]), ' ')), 'B') ||
  setweight(to_tsvector('simple', coalesce("body", '')), 'C');--> statement-breakpoint
ALTER TABLE "search_documents" ALTER COLUMN "search_vector" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_documents_card_idx" ON "search_documents" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "search_documents_active_scope_idx" ON "search_documents" USING btree ("workspace_id","board_id","entity_type","updated_at") WHERE "search_documents"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "search_documents_search_vector_gin_idx" ON "search_documents" USING gin ("search_vector");
