CREATE TABLE "push_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"push_token_id" text NOT NULL,
	"outbox_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "push_receipts" ADD CONSTRAINT "push_receipts_push_token_id_push_tokens_id_fk" FOREIGN KEY ("push_token_id") REFERENCES "public"."push_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_receipts" ADD CONSTRAINT "push_receipts_outbox_id_notification_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."notification_outbox"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_receipts_pending_idx" ON "push_receipts" USING btree ("created_at") WHERE "push_receipts"."checked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "push_receipts_token_idx" ON "push_receipts" USING btree ("push_token_id");