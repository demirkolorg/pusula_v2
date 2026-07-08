ALTER TABLE "checklist_items" ADD COLUMN "parent_item_id" text;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD COLUMN "depth" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_parent_item_id_checklist_items_id_fk" FOREIGN KEY ("parent_item_id") REFERENCES "public"."checklist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklist_items_parent_position_idx" ON "checklist_items" USING btree ("parent_item_id","position");