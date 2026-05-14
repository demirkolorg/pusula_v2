DROP INDEX "notifications_recipient_unread_idx";--> statement-breakpoint
CREATE INDEX "notification_outbox_pending_idx" ON "notification_outbox" USING btree ("created_at") WHERE "notification_outbox"."processed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "notification_outbox_cooldown_idx" ON "notification_outbox" USING btree ("recipient_id","type","created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_unread_idx" ON "notifications" USING btree ("recipient_id") WHERE "notifications"."read_at" IS NULL;